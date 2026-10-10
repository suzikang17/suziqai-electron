import type { Page } from 'playwright';
import type { StepAction } from '../shared/types';
import { decide, snapshotCandidates, uniqueLocator, type JevClient } from './jev-decider';

// Self-healing for web steps: when a step's selector no longer matches exactly one element
// (the UI changed, or the selector was ambiguous), ask Jev which element the step means and
// build a fresh unique locator. Only confident, stable picks are used; otherwise the step fails.

/** Playwright errors that mean "the selector didn't find exactly one element". */
export function isLocatorFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /strict mode violation/.test(msg) || (/Timeout \d+ms exceeded/.test(msg) && /waiting for (getBy|locator)/.test(msg));
}

/** Steps that act on (or positively check) an element. Never "hidden": not finding it is the point. */
export function canHeal(action: StepAction): action is Extract<StepAction, { selector?: string }> & { selector: string } {
  if (!('selector' in action) || !action.selector) return false;
  if (action.type === 'assert') return action.assertionType !== 'hidden' && action.assertionType !== 'url';
  return ['click', 'fill', 'press', 'waitFor'].includes(action.type) || (action.type === 'swipe' && !!action.selector);
}

function instruction(label: string, action: StepAction): string {
  const hint = 'selector' in action && action.selector ? ` (previously matched by ${action.selector})` : '';
  if (action.type === 'fill') return `${label}${hint} (type "${action.value}")`;
  if (action.type === 'press') return `${label}${hint} (press ${action.key})`;
  if (action.type === 'assert') return `${label}${hint} (check it is ${action.assertionType})`;
  return `${label}${hint}`;
}

/** A unique locator for the element `label` describes on the current page, or null if Jev isn't sure. */
export async function healSelector(page: Page, jev: JevClient, label: string, action: StepAction): Promise<string | null> {
  const candidates = await snapshotCandidates(page);
  if (candidates.length === 0) return null;
  const decision = await decide(jev, instruction(label, action), candidates, { url: page.url(), title: await page.title() });
  if (!decision.confident || !decision.candidate) return null;
  return uniqueLocator(page, decision.candidate);
}
