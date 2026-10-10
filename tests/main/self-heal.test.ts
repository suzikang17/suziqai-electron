// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { canHeal, healSelector, isLocatorFailure } from '../../src/main/self-heal';
import { candidateForElement, uniqueLocator } from '../../src/main/jev-decider';
import type { JevClient } from '../../src/main/jev-decider';

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
afterAll(async () => { await browser.close(); });

/** Fake Jev: picks the element line containing `needle`, with the given confidence. */
function fakeJev(needle: string | null, confidence = 0.95): JevClient {
  return {
    systemOne: vi.fn(async (req: any) => {
      const line = needle ? (req.state as string).split('\n').find((l: string) => l.startsWith('[e') && l.includes(needle)) : undefined;
      const key = line ? line.match(/^\[(e\d+)\]/)![1] : 'none';
      const a = { type: 'choice', choice: key, confidence, probabilities: { [key]: 1 } };
      return { model: 'jev', answers: { target: a, target_reversed: a, action: a }, usage: { input_tokens: 1, output_tokens: 1 } };
    }),
  };
}

describe('isLocatorFailure', () => {
  it('recognises missing and ambiguous elements, not other errors', () => {
    expect(isLocatorFailure(new Error('locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole(\'button\')'))).toBe(true);
    expect(isLocatorFailure(new Error("strict mode violation: getByRole('checkbox') resolved to 4 elements"))).toBe(true);
    expect(isLocatorFailure(new Error('URL assertion failed: expected "/x" in "https://y"'))).toBe(false);
    expect(isLocatorFailure(new Error('net::ERR_BLOCKED_BY_CLIENT'))).toBe(false);
  });
});

describe('canHeal', () => {
  it('heals element actions and positive checks, never navigation, URL or "hidden" checks', () => {
    expect(canHeal({ type: 'click', selector: 'x' })).toBe(true);
    expect(canHeal({ type: 'fill', selector: 'x', value: 'v' })).toBe(true);
    expect(canHeal({ type: 'assert', assertionType: 'visible', expected: '', selector: 'x' })).toBe(true);
    expect(canHeal({ type: 'assert', assertionType: 'hidden', expected: '', selector: 'x' })).toBe(false);
    expect(canHeal({ type: 'assert', assertionType: 'url', expected: '/x' })).toBe(false);
    expect(canHeal({ type: 'navigate', url: 'https://x' })).toBe(false);
  });
});

describe('healSelector', () => {
  it('finds the renamed element and returns a unique locator', async () => {
    // The step was recorded when the button said "Save"; the app now says "Save changes"
    await page.setContent(`<button>Cancel</button><button>Save changes</button>`);
    const healed = await healSelector(page, fakeJev('Save changes'), 'Click Save', { type: 'click', selector: "getByRole('button', { name: 'Save', exact: true })" });
    expect(healed).toBe("getByRole('button', { name: 'Save changes' })");
  });

  it('pins one of several identical elements', async () => {
    await page.setContent(`<ul><li><input type="checkbox" aria-label="Toggle"></li><li><input type="checkbox" aria-label="Toggle"></li></ul>`);
    const healed = await healSelector(page, fakeJev('e2'), 'Tick the second todo', { type: 'click', selector: "getByRole('checkbox', { name: 'Toggle' })" });
    expect(healed).toBe("getByRole('checkbox', { name: 'Toggle', exact: true }).nth(1)");
  });

  it('returns null when Jev is unsure, so the step fails instead of guessing', async () => {
    await page.setContent(`<button>Cancel</button><button>Save changes</button>`);
    expect(await healSelector(page, fakeJev('Save changes', 0.3), 'Click Save', { type: 'click', selector: 'x' })).toBeNull();
    expect(await healSelector(page, fakeJev(null), 'Click Save', { type: 'click', selector: 'x' })).toBeNull();
  });
});

describe('candidateForElement (recorder selectors from the accessibility tree)', () => {
  it("uses the browser's accessible name when the visible label is hidden by CSS", async () => {
    await page.setContent(`
      <button class="inline-flex items-center">Export</button>
      <button class="inline-flex items-center" title="New Job Order" data-rec="7"><svg width="8" height="8"></svg><span style="display:none">New Job Order</span></button>`);
    const candidate = await candidateForElement(page, '[data-rec="7"]');
    expect(candidate).toMatchObject({ role: 'button', name: 'New Job Order' });
    expect(await uniqueLocator(page, candidate!)).toBe("getByRole('button', { name: 'New Job Order' })");
  });

  it('returns null for an element that no longer exists', async () => {
    await page.setContent(`<button>Ok</button>`);
    expect(await candidateForElement(page, '[data-rec="missing"]')).toBeNull();
  });
});
