import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import type { BrowserManager } from './browser-manager';
import type { Step, StepAction, VideoStep } from '../shared/types';

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

async function resolveSelector(
  elementHint: string,
  a11yTree: string
): Promise<string | null> {
  const prompt = `${RESOLVE_PROMPT}

Accessibility tree:
${a11yTree}

Element to find: ${elementHint}`;

  try {
    const selector = await invokeClaudeCli(prompt);
    // Basic validation — should look like a Playwright selector
    if (selector && (
      selector.startsWith('getBy') ||
      selector.startsWith('locator(') ||
      selector.match(/^[a-z#.\[]/i) // CSS selector
    )) {
      return selector;
    }
    return null;
  } catch {
    return null;
  }
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
}

export interface ProgressCallback {
  (detail: string, stepIndex: number, totalSteps: number): void;
}

export async function resolveSelectors(
  videoSteps: VideoStep[],
  browserManager: BrowserManager,
  onProgress?: ProgressCallback
): Promise<ResolveResult> {
  const steps: Step[] = [];
  let resolvedCount = 0;
  let unresolvedCount = 0;

  for (let i = 0; i < videoSteps.length; i++) {
    const vs = videoSteps[i];
    onProgress?.(`Resolving step ${i + 1} of ${videoSteps.length}: ${vs.label}`, i, videoSteps.length);

    // Navigate actions don't need selector resolution
    if (vs.actionType === 'navigate') {
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
        await browserManager.executeAction(action);
        // Wait for page to settle
        await new Promise(r => setTimeout(r, 1000));
      } catch {
        // Continue even if navigation fails
      }
      continue;
    }

    // For click/fill: capture a11y tree and resolve selector
    let selector: string | null = null;
    let needsRefinement = false;

    if (vs.elementHint) {
      try {
        const a11yTree = await browserManager.getAccessibilityTree();
        selector = await resolveSelector(vs.elementHint, a11yTree);
      } catch {
        // a11y tree capture failed — keep hint
      }
    }

    if (selector) {
      resolvedCount++;
    } else {
      unresolvedCount++;
      needsRefinement = true;
    }

    const action = videoStepToAction(vs, selector ?? undefined);
    const step: Step = {
      id: randomUUID(),
      label: needsRefinement ? `[needs selector] ${vs.label}` : vs.label,
      action,
      status: 'pending',
    };
    steps.push(step);

    // Execute the resolved action to advance browser state for next step
    if (selector && !needsRefinement) {
      try {
        await browserManager.executeAction(action);
        await new Promise(r => setTimeout(r, 500));
      } catch {
        // Action failed — browser state may be off, but continue
      }
    }
  }

  return { steps, resolvedCount, unresolvedCount };
}
