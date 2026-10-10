import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import type { Page } from 'playwright';
import type { Step, StepAction, VideoStep } from '../shared/types';
import { decide, snapshotCandidates, uniqueLocator, type JevClient } from './jev-decider';

const RESOLVE_PROMPT = `You are a Playwright selector expert. Given an accessibility tree (ARIA snapshot) of a web page and a visual description of an element, return the single best Playwright selector for that element.

Selector priority (use the highest applicable):
1. getByRole('role', { name: 'text' })
2. getByLabel('text')
3. getByPlaceholder('text')
4. getByText('text')
5. getByTestId('id')
6. CSS selector (last resort)

Output ONLY the selector string. No explanation, no quotes around it, no markdown.

Examples:
- "button labeled Save" → getByRole('button', { name: 'Save' })
- "text input with placeholder Email" → getByPlaceholder('Email')
- "link that says Learn More" → getByRole('link', { name: 'Learn More' })
- "tab labeled Schedule in bottom nav" → getByRole('tab', { name: 'Schedule' })`;

function invokeClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '--print', prompt,
      '--output-format', 'text',
      '--max-turns', '1',
      '--model', 'haiku',
    ];

    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude CLI exited ${code}: ${stderr}`));
      else resolve(stdout.trim());
    });
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
    });
  });
}

export async function claudeResolveSelector(
  elementHint: string,
  a11yTree: string
): Promise<string | null> {
  const prompt = `${RESOLVE_PROMPT}

Accessibility tree:
${a11yTree}

Element to find: ${elementHint}`;

  try {
    const selector = await invokeClaudeCli(prompt);
    if (isSelectorLike(selector)) return selector;
    return null;
  } catch {
    return null;
  }
}

/** Rejects prose (e.g. "The element ... is not present") that the model returns instead of a selector. */
export function isSelectorLike(text: string): boolean {
  const s = text.trim();
  if (!s || s.includes('\n') || s.length > 200) return false;
  if (/^getBy(Role|Label|Placeholder|Text|TestId)\(.*\)(\.(first|last)\(\)|\.nth\(\d+\))?$/.test(s)) return true;
  // CSS: a lone tag, or something with CSS syntax and no sentence punctuation
  if (/^[a-z][a-z0-9-]*$/i.test(s)) return true;
  return /[#.[\]>:]/.test(s) && !/[.!?]$/.test(s) && !/[a-z]{2,}\s+[a-z]{2,}\s+[a-z]{2,}/i.test(s.replace(/\[[^\]]*\]|"[^"]*"|'[^']*'/g, ''));
}

/** Navigations we can't replay: no URL, or a blank/internal page the video showed no address for. */
function hasRealUrl(url?: string): boolean {
  return !!url && !/^(about|data|chrome|javascript):/i.test(url.trim());
}

function videoStepToAction(step: VideoStep, selector?: string): StepAction {
  switch (step.actionType) {
    case 'navigate':
      return { type: 'navigate', url: step.url ?? '' };
    case 'click':
      return { type: 'click', selector: selector ?? step.elementHint ?? '' };
    case 'fill':
      return { type: 'fill', selector: selector ?? step.elementHint ?? '', value: step.value ?? '' };
  }
}

export interface ResolveResult {
  steps: Step[];
  resolvedCount: number;
  unresolvedCount: number;
  resolvedByJev: number;
  resolvedByClaude: number;
}

export interface ProgressCallback {
  (detail: string, stepIndex: number, totalSteps: number): void;
}

export interface ResolverDeps {
  getPage: () => Promise<Page>;
  executeAction: (action: StepAction) => Promise<void>;
  /** When set, Jev picks the element first; Claude is the fallback for unsure picks. */
  jev?: JevClient | null;
  claudeResolve?: (elementHint: string, a11yTree: string) => Promise<string | null>;
}

/** Ask Jev for the element; returns a unique locator only for confident picks. */
async function jevResolveSelector(jev: JevClient, page: Page, vs: VideoStep): Promise<string | null> {
  const candidates = await snapshotCandidates(page);
  if (candidates.length === 0) return null;
  const instruction =
    `${vs.label}. Element: ${vs.elementHint}` + (vs.actionType === 'fill' ? ` (type "${vs.value ?? ''}")` : '');
  const decision = await decide(jev, instruction, candidates, { url: page.url(), title: await page.title() });
  if (!decision.confident || !decision.candidate) return null;
  return uniqueLocator(page, decision.candidate);
}

export async function resolveSelectors(
  videoSteps: VideoStep[],
  deps: ResolverDeps,
  onProgress?: ProgressCallback
): Promise<ResolveResult> {
  const { getPage, executeAction, jev, claudeResolve = claudeResolveSelector } = deps;
  const steps: Step[] = [];
  let resolvedCount = 0;
  let unresolvedCount = 0;
  let resolvedByJev = 0;
  let resolvedByClaude = 0;

  for (let i = 0; i < videoSteps.length; i++) {
    const vs = videoSteps[i];
    onProgress?.(`Resolving step ${i + 1} of ${videoSteps.length}: ${vs.label}`, i, videoSteps.length);

    // Navigate actions don't need selector resolution
    if (vs.actionType === 'navigate') {
      if (!hasRealUrl(vs.url)) continue;
      const action = videoStepToAction(vs);
      steps.push({
        id: randomUUID(),
        label: vs.label,
        action,
        status: 'pending',
      });
      resolvedCount++;

      // Execute the navigation to advance browser state
      try {
        await executeAction(action);
        // Wait for page to settle
        await new Promise(r => setTimeout(r, 1000));
      } catch {
        // Continue even if navigation fails
      }
      continue;
    }

    // For click/fill: Jev first, then Claude on the a11y tree
    let selector: string | null = null;

    if (vs.elementHint) {
      try {
        const page = await getPage();
        if (jev) {
          selector = await jevResolveSelector(jev, page, vs).catch((err) => {
            console.warn('[selector-resolver] Jev failed, falling back to Claude:', (err as Error).message);
            return null;
          });
          if (selector) {
            resolvedByJev++;
            console.log(`[selector-resolver] jev: "${vs.label}" → ${selector}`);
          }
        }
        if (!selector) {
          const claudeSelector = await claudeResolve(vs.elementHint, await page.locator('body').ariaSnapshot());
          selector = claudeSelector && isSelectorLike(claudeSelector) ? claudeSelector : null;
          if (selector) console.log(`[selector-resolver] claude: "${vs.label}" → ${selector}`);
          if (selector) resolvedByClaude++;
        }
      } catch {
        // page or a11y tree unavailable — keep hint
      }
    }

    if (selector) {
      resolvedCount++;
    } else {
      unresolvedCount++;
    }

    const action = videoStepToAction(vs, selector ?? undefined);
    steps.push({
      id: randomUUID(),
      label: selector ? vs.label : `[needs selector] ${vs.label}`,
      action,
      status: 'pending',
    });

    // Execute the resolved action to advance browser state for next step
    if (selector) {
      try {
        await executeAction(action);
        await new Promise(r => setTimeout(r, 500));
      } catch {
        // Action failed — browser state may be off, but continue
      }
    }
  }

  return { steps, resolvedCount, unresolvedCount, resolvedByJev, resolvedByClaude };
}
