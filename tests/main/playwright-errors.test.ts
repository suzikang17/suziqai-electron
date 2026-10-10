// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { summarizePlaywrightError } from '../../src/main/playwright-errors';

describe('summarizePlaywrightError', () => {
  it('keeps the headline and the latest blocking reason from the call log', () => {
    const msg = [
      'locator.click: Timeout 5000ms exceeded.',
      'Call log:',
      "\u001b[2m  - waiting for getByRole('button', { name: 'Clear All' })\u001b[22m",
      '\u001b[2m  - locator resolved to <button type="button" class="inline-flex">Clear All</button>\u001b[22m',
      '\u001b[2m  - attempting click action\u001b[22m',
      '\u001b[2m    - element is not visible\u001b[22m',
      '\u001b[2m    - <div data-radix-popper-content-wrapper="">…</div> intercepts pointer events\u001b[22m',
      '\u001b[2m  - retrying click action\u001b[22m',
    ].join('\n');
    expect(summarizePlaywrightError(msg)).toBe(
      'locator.click: Timeout 5000ms exceeded. — <div data-radix-popper-content-wrapper="">…</div> intercepts pointer events',
    );
  });

  it('returns the headline when the log has no reason', () => {
    expect(summarizePlaywrightError('page.goto: net::ERR_NAME_NOT_RESOLVED at http://x/\nCall log:\n  - navigating to "http://x/"')).toBe(
      'page.goto: net::ERR_NAME_NOT_RESOLVED at http://x/',
    );
  });
});
