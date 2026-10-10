import { appendFile } from 'fs/promises';
import type { Page } from 'playwright';
import type { StepAction } from '../shared/types';
import type { QueryStats } from './claude-session';
import { resolveLocator } from './browser-actions';
import { decide, snapshotCandidates, withMarkedElement, type JevClient, type JevDecision } from './jev-decider';

// Spike: shadow-run Jev against each step Claude proposes and log how they compare.
// Claude's steps still drive the app; this only observes.

type Agreement =
  | 'same-element'
  | 'different-element'
  | 'jev-none'
  | 'claude-not-on-page'
  | 'error';

export interface ShadowRecord {
  at: string;
  url: string;
  userMessage: string;
  step: string;
  claude: { action: string; selector: string; selectorKind: string; stats: QueryStats | null; stepsInResponse: number };
  jev?: Omit<JevDecision, 'candidate'> & { locator: string | null; locatorMatches: number; ms: number };
  snapshotMs: number;
  agreement: Agreement;
  error?: string;
}

export function selectorKind(selector: string): string {
  const m = selector.match(/^(getBy\w+)\(/);
  return m ? m[1] : 'css';
}

export function instructionFor(label: string, action: StepAction): string {
  if (action.type === 'fill') return `${label} (type "${action.value}")`;
  if (action.type === 'press') return `${label} (press ${action.key})`;
  return label;
}

/** Does Claude's selector resolve to the same DOM node as Jev's pick? */
function sameElement(page: Page, claudeSelector: string, backendNodeId: number): Promise<boolean> {
  return withMarkedElement(page, backendNodeId, () =>
    resolveLocator(page, claudeSelector).first().evaluate((el) => el.hasAttribute('data-jev-pick')),
  );
}

export async function runJevShadow(opts: {
  page: Page;
  client: JevClient;
  logPath: string;
  userMessage: string;
  steps: Array<{ label: string; action: StepAction }>;
  claudeStats: QueryStats | null;
}): Promise<ShadowRecord[]> {
  const { page, client, logPath, userMessage, steps, claudeStats } = opts;
  const targeted = steps.filter(
    (s): s is { label: string; action: Extract<StepAction, { type: 'click' | 'fill' | 'press' }> } =>
      s.action.type === 'click' || s.action.type === 'fill' || s.action.type === 'press',
  );
  if (targeted.length === 0) return [];

  const snapStart = Date.now();
  const candidates = await snapshotCandidates(page);
  const snapshotMs = Date.now() - snapStart;
  const pageInfo = { url: page.url(), title: await page.title() };

  const records: ShadowRecord[] = [];
  for (const step of targeted) {
    const record: ShadowRecord = {
      at: new Date().toISOString(),
      url: pageInfo.url,
      userMessage,
      step: step.label,
      claude: {
        action: step.action.type,
        selector: step.action.selector,
        selectorKind: selectorKind(step.action.selector),
        stats: claudeStats,
        stepsInResponse: steps.length,
      },
      snapshotMs,
      agreement: 'error',
    };

    try {
      const start = Date.now();
      const { candidate, ...decision } = await decide(client, instructionFor(step.label, step.action), candidates, pageInfo);
      const ms = Date.now() - start;
      const locatorMatches = candidate ? await resolveLocator(page, candidate.locator).count() : 0;
      record.jev = { ...decision, locator: candidate?.locator ?? null, locatorMatches, ms };

      const claudeMatches = await resolveLocator(page, step.action.selector).count().catch(() => 0);
      if (claudeMatches === 0) {
        record.agreement = 'claude-not-on-page';
      } else if (!candidate || candidate.backendNodeId === undefined) {
        record.agreement = 'jev-none';
      } else {
        record.agreement = (await sameElement(page, step.action.selector, candidate.backendNodeId))
          ? 'same-element'
          : 'different-element';
      }
    } catch (err) {
      record.error = (err as Error).message;
    }

    records.push(record);
    await appendFile(logPath, JSON.stringify(record) + '\n');
    console.log(
      `[jev-shadow] ${record.agreement} | "${step.label}" | claude=${step.action.selector} | ` +
        `jev=${record.jev?.locator ?? '-'} conf=${record.jev?.confidence.toFixed(2) ?? '-'} ` +
        `stable=${record.jev?.stable ?? '-'} ${record.jev?.ms ?? '-'}ms`,
    );
  }
  return records;
}
