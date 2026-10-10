// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { resolveLocator, pickTargetPage } from '../../src/main/browser-actions';
import { snapshotCandidates, uniqueLocator, type JevClient } from '../../src/main/jev-decider';
import { resolveSelectors, isSelectorLike, type ResolverDeps } from '../../src/main/selector-resolver';
import type { VideoStep } from '../../src/shared/types';

const HTML = `<!doctype html><title>Shop</title>
<nav><a href="#">new</a> <a href="#">newest</a> <a href="#">past</a></nav>
<form>
  <label>Email <input type="email"></label>
  <label><input type="checkbox"> A</label>
  <input type="checkbox" id="c1"> <input type="checkbox" id="c2">
  <button type="button" onclick="this.textContent='Saved'">Save</button>
</form>`;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});
beforeEach(async () => {
  page = await browser.newPage();
  await page.setContent(HTML);
});

/** Fake Jev: picks the element whose state line contains `target`, with the given confidence. */
function fakeJev(pick: (state: string) => string | null, confidence = 0.95): JevClient & { systemOne: ReturnType<typeof vi.fn> } {
  return {
    systemOne: vi.fn(async (req: any) => {
      const state: string = req.state;
      const target = pick(state);
      const line = target ? state.split('\n').find((l) => l.includes(target)) : undefined;
      const key = line ? line.match(/^\[(e\d+)\]/)![1] : 'none';
      const answer = { type: 'choice', choice: key, confidence, probabilities: { [key]: 1 } };
      return {
        model: 'jev-test',
        answers: { target: answer, target_reversed: answer, action: { type: 'choice', choice: 'click', confidence: 1, probabilities: {} } },
        usage: { input_tokens: 100, output_tokens: 10 },
      };
    }),
  };
}

function deps(overrides: Partial<ResolverDeps> = {}): ResolverDeps {
  return {
    getPage: async () => page,
    executeAction: vi.fn(async () => {}),
    jev: null,
    claudeResolve: vi.fn(async () => null),
    ...overrides,
  };
}

describe('resolveLocator chains', () => {
  it('supports .first(), .last() and .nth(n)', async () => {
    expect(await resolveLocator(page, "getByRole('checkbox').first()").getAttribute('type')).toBe('checkbox');
    expect(await resolveLocator(page, "getByRole('checkbox').last()").getAttribute('id')).toBe('c2');
    expect(await resolveLocator(page, "getByRole('checkbox').nth(1)").getAttribute('id')).toBe('c1');
  });

  it('supports exact: true on getByRole', async () => {
    expect(await resolveLocator(page, "getByRole('link', { name: 'new' })").count()).toBe(2);
    expect(await resolveLocator(page, "getByRole('link', { name: 'new', exact: true })").count()).toBe(1);
  });
});

describe('uniqueLocator', () => {
  it('keeps the plain locator when it is already unique', async () => {
    const c = (await snapshotCandidates(page)).find((x) => x.name === 'Save')!;
    expect(await uniqueLocator(page, c)).toBe("getByRole('button', { name: 'Save' })");
  });

  it('adds exact: true when the name is a prefix of another', async () => {
    const c = (await snapshotCandidates(page)).find((x) => x.name === 'new')!;
    expect(await uniqueLocator(page, c)).toBe("getByRole('link', { name: 'new', exact: true })");
  });

  it('falls back to .nth() pointing at the picked element', async () => {
    const unnamed = (await snapshotCandidates(page)).filter((x) => x.role === 'checkbox' && !x.name);
    const second = unnamed[1];
    const locator = await uniqueLocator(page, second);
    expect(locator).toBe("getByRole('checkbox').nth(2)");
    expect(await resolveLocator(page, locator!).getAttribute('id')).toBe('c2');
  });
});

describe('resolveSelectors', () => {
  const save: VideoStep = { label: 'Click Save', actionType: 'click', elementHint: 'blue button labeled Save' };

  it('uses Jev when it is confident', async () => {
    const d = deps({ jev: fakeJev(() => '"Save"') });
    const result = await resolveSelectors([save], d);

    expect(result.steps[0].action).toEqual({ type: 'click', selector: "getByRole('button', { name: 'Save' })" });
    expect(result.resolvedByJev).toBe(1);
    expect(d.claudeResolve).not.toHaveBeenCalled();
    expect(d.executeAction).toHaveBeenCalledWith(result.steps[0].action);
  });

  it('falls back to Claude when Jev is unsure', async () => {
    const claudeResolve = vi.fn(async () => "getByText('Save')");
    const d = deps({ jev: fakeJev(() => '"Save"', 0.3), claudeResolve });
    const result = await resolveSelectors([save], d);

    expect(result.steps[0].action).toEqual({ type: 'click', selector: "getByText('Save')" });
    expect(result.resolvedByJev).toBe(0);
    expect(result.resolvedByClaude).toBe(1);
  });

  it('uses Claude when there is no Jev client', async () => {
    const claudeResolve = vi.fn(async () => "getByRole('button', { name: 'Save' })");
    const result = await resolveSelectors([save], deps({ claudeResolve }));
    expect(result.resolvedByClaude).toBe(1);
    expect(claudeResolve).toHaveBeenCalledWith('blue button labeled Save', expect.stringContaining('Save'));
  });

  it('marks the step when nothing resolves', async () => {
    const d = deps({ jev: fakeJev(() => null) });
    const result = await resolveSelectors([save], d);
    expect(result.unresolvedCount).toBe(1);
    expect(result.steps[0].label).toBe('[needs selector] Click Save');
    expect(d.executeAction).not.toHaveBeenCalled();
  });

  it('passes the fill value through and executes navigations', async () => {
    const d = deps({ jev: fakeJev(() => '"Email"') });
    const result = await resolveSelectors(
      [
        { label: 'Open shop', actionType: 'navigate', url: 'https://example.com' },
        { label: 'Enter email', actionType: 'fill', elementHint: 'email field', value: 'a@b.co' },
      ],
      d,
    );
    expect(result.steps[1].action).toEqual({ type: 'fill', selector: "getByRole('textbox', { name: 'Email' })", value: 'a@b.co' });
    expect(d.executeAction).toHaveBeenCalledWith({ type: 'navigate', url: 'https://example.com' });
  });
});

describe('press steps', () => {
  it('resolves the element and keeps the key', async () => {
    const d = deps({ jev: fakeJev(() => '"Email"') });
    const result = await resolveSelectors(
      [{ label: 'Submit email with Enter', actionType: 'press', elementHint: 'email field', key: 'Enter' }],
      d,
    );
    expect(result.steps[0].action).toEqual({ type: 'press', selector: "getByRole('textbox', { name: 'Email' })", key: 'Enter' });
    expect(d.executeAction).toHaveBeenCalledWith(result.steps[0].action);
  });

  it('executes a press on a real page', async () => {
    await page.setContent(`<input aria-label="New todo" onkeydown="if(event.key==='Enter'){document.body.dataset.added=this.value}">`);
    await page.getByLabel('New todo').fill('Buy milk');
    const { executeOnPage } = await import('../../src/main/browser-actions');
    await executeOnPage(page, { type: 'press', selector: "getByLabel('New todo')", key: 'Enter' });
    expect(await page.evaluate(() => document.body.dataset.added)).toBe('Buy milk');
  });
});

describe('executeOnPage assertions and placeholders', () => {
  it('checks attributes, URL patterns and counts, and fills {{env.NAME}} from the environment', async () => {
    const { executeOnPage } = await import('../../src/main/browser-actions');
    await page.setContent(`<button aria-pressed="true">Week</button><input aria-label="Email">`);
    await executeOnPage(page, { type: 'assert', assertionType: 'attribute', attribute: 'aria-pressed', expected: 'true', selector: "getByRole('button', { name: 'Week' })" });
    await expect(executeOnPage(page, { type: 'assert', assertionType: 'attribute', attribute: 'aria-pressed', expected: 'false', selector: "getByRole('button', { name: 'Week' })" }, 500)).rejects.toThrow();

    await executeOnPage(page, { type: 'assert', assertionType: 'url', expected: '/^about:blank$/' });
    await expect(executeOnPage(page, { type: 'assert', assertionType: 'url', expected: '/^https:/' }, 300)).rejects.toThrow(/URL/);
    await executeOnPage(page, { type: 'assert', assertionType: 'count', expected: '1', selector: "getByRole('button')" });

    process.env.SUZIQAI_TEST_EMAIL = 'qa@example.com';
    await executeOnPage(page, { type: 'fill', selector: "getByLabel('Email')", value: '{{env.SUZIQAI_TEST_EMAIL}}' });
    expect(await page.getByLabel('Email').inputValue()).toBe('qa@example.com');
  });
});

describe('assertions wait for the condition, like Playwright expect', () => {
  it('passes when text and URL change within the timeout, fails after it', async () => {
    const { executeOnPage } = await import('../../src/main/browser-actions');
    await page.setContent(`<div id="out"></div><script>setTimeout(() => { document.getElementById('out').textContent = 'Loaded'; location.hash = 'done'; }, 400)</script>`);
    const t0 = Date.now();
    await executeOnPage(page, { type: 'assert', assertionType: 'text', expected: 'Loaded' }, 3000);
    await executeOnPage(page, { type: 'assert', assertionType: 'url', expected: '#done' }, 3000);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(350);
    await expect(executeOnPage(page, { type: 'assert', assertionType: 'text', expected: 'Nope', selector: '#out' }, 300)).rejects.toThrow(/"Nope" not found in #out/);
  });
});

describe('safety guards', () => {
  it('rejects a Claude fallback selector that matches nothing on the page', async () => {
    const claudeResolve = vi.fn(async () => "getByRole('link', { name: 'Active' })");
    const d = deps({ jev: fakeJev(() => null), claudeResolve });
    const result = await resolveSelectors([{ label: 'Click Active filter', actionType: 'click', elementHint: 'Active filter link' }], d);
    expect(result.unresolvedCount).toBe(1);
    expect(result.steps[0].label).toBe('[needs selector] Click Active filter');
    expect(d.executeAction).not.toHaveBeenCalled();
  });

  it('skips navigations without a real URL instead of executing them', async () => {
    const d = deps();
    const result = await resolveSelectors(
      [
        { label: 'Navigate to login page', actionType: 'navigate', url: 'about:blank' },
        { label: 'Navigate somewhere', actionType: 'navigate' },
      ],
      d,
    );
    expect(result.steps).toHaveLength(0);
    expect(d.executeAction).not.toHaveBeenCalled();
  });

  it('rejects prose from the Claude fallback', async () => {
    const claudeResolve = vi.fn(async () => 'The element labeled "Username" is not present in the provided accessibility tree.');
    const d = deps({ claudeResolve });
    const result = await resolveSelectors([{ label: 'Click Username', actionType: 'click', elementHint: 'Username field' }], d);
    expect(result.unresolvedCount).toBe(1);
    expect(d.executeAction).not.toHaveBeenCalled();
  });

  it.each([
    ["getByRole('button', { name: 'Save' })", true],
    ["getByLabel('Email').first()", true],
    ['#login-form input[name="email"]', true],
    ['button.primary', true],
    ['button', true],
    ['The element labeled "Username" is not present.', false],
    ["If you meant the Email field:\ngetByPlaceholder('x')", false],
    ['Sorry, I cannot find it', false],
  ])('isSelectorLike(%j) is %s', (sel, ok) => {
    expect(isSelectorLike(sel)).toBe(ok);
  });
});

describe('pickTargetPage', () => {
  const p = (url: string) => ({ url: () => url });

  it('never returns the app UI or devtools', () => {
    expect(pickTargetPage([p('http://localhost:5173/'), p('devtools://devtools/x')])).toBeNull();
  });

  it('returns the browser view even when it is blank', () => {
    const view = p('about:blank');
    expect(pickTargetPage([p('http://localhost:5173/'), view])).toBe(view);
  });

  it('prefers the expected URL when several views exist', () => {
    const stale = p('https://app.example.com/auth');
    const active = p('https://the-internet.herokuapp.com/login');
    expect(pickTargetPage([stale, active], 'https://the-internet.herokuapp.com/login')).toBe(active);
  });
});
