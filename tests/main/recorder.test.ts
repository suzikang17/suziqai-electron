// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { RECORDER_SCRIPT, RECORD_PREFIX, eventToStep, type CapturedEvent } from '../../src/main/recorder';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });

/** Loads HTML, injects the recorder, and collects what it reports over console messages. */
async function recordOn(html: string): Promise<{ page: Page; events: CapturedEvent[] }> {
  const page = await browser.newPage();
  const events: CapturedEvent[] = [];
  page.on('console', (m) => {
    if (m.text().startsWith(RECORD_PREFIX)) events.push(JSON.parse(m.text().slice(RECORD_PREFIX.length)));
  });
  await page.setContent(html);
  await page.evaluate(RECORDER_SCRIPT);
  return { page, events };
}

describe('RECORDER_SCRIPT', () => {
  it('captures clicks on the interactive element, not its inner icon', async () => {
    const { page, events } = await recordOn(`<button aria-label="Next week"><svg width="10" height="10"><rect width="10" height="10"/></svg></button>`);
    await page.locator('rect').click();
    await expect.poll(() => events.length).toBe(1);
    expect(events[0]).toMatchObject({ kind: 'click', info: { tag: 'button', ariaLabel: 'Next week' } });
  });

  it('records a text field once, with its final value, and not the focusing click', async () => {
    const { page, events } = await recordOn(`<label>Title <input id="t"></label><button>Go</button>`);
    await page.getByLabel('Title').click();
    await page.getByLabel('Title').pressSequentially('Board run');
    await page.getByRole('button', { name: 'Go' }).click(); // blur → change
    await expect.poll(() => events.length).toBe(2);
    expect(events.map((e) => e.kind)).toEqual(['fill', 'click']);
    expect(events[0]).toMatchObject({ value: 'Board run', info: { parentLabelText: 'Title' } });
  });

  it('turns Enter in a field into fill then press, without a duplicate fill on blur', async () => {
    const { page, events } = await recordOn(`<input placeholder="Search" /><button>x</button>`);
    await page.getByPlaceholder('Search').fill('milk');
    await page.getByPlaceholder('Search').press('Enter');
    await page.getByRole('button', { name: 'x' }).click();
    await expect.poll(() => events.length).toBe(3);
    expect(events.map((e) => [e.kind, e.value ?? e.key ?? ''])).toEqual([['fill', 'milk'], ['press', 'Enter'], ['click', '']]);
  });

  it('never captures password values', async () => {
    const { page, events } = await recordOn(`<input type="password" aria-label="Password" /><button>Log in</button>`);
    await page.getByLabel('Password').fill('hunter2');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect.poll(() => events.length).toBe(2);
    expect(events[0]).toMatchObject({ kind: 'fill', masked: true, value: '' });
    expect(JSON.stringify(events)).not.toContain('hunter2');
  });

  it('tags each recorded element so ambiguous selectors can be pinned', async () => {
    const { page, events } = await recordOn(`<ul><li><input type="checkbox" aria-label="Toggle"></li><li><input type="checkbox" aria-label="Toggle"></li></ul>`);
    await page.getByRole('checkbox').nth(1).click();
    await expect.poll(() => events.length).toBe(1);
    const tagged = await page.locator(`[data-suziqai-rec="${events[0].recId}"]`).evaluate((el) => [...el.closest('ul')!.querySelectorAll('input')].indexOf(el as HTMLInputElement));
    expect(tagged).toBe(1);
  });

  it('is idempotent when injected twice', async () => {
    const { page, events } = await recordOn(`<button>Once</button>`);
    await page.evaluate(RECORDER_SCRIPT);
    await page.getByRole('button', { name: 'Once' }).click();
    await page.waitForTimeout(200);
    expect(events).toHaveLength(1);
  });
});

describe('eventToStep', () => {
  const info = { tag: 'button' } as CapturedEvent['info'];
  it('maps clicks, fills, Enter, and masked passwords', () => {
    expect(eventToStep({ kind: 'click', info }, "getByRole('button', { name: 'Go' })")).toEqual({
      label: "Click getByRole('button', { name: 'Go' })",
      action: { type: 'click', selector: "getByRole('button', { name: 'Go' })" },
    });
    expect(eventToStep({ kind: 'fill', info, value: 'milk' }, "getByLabel('Item')").action).toEqual({ type: 'fill', selector: "getByLabel('Item')", value: 'milk' });
    expect(eventToStep({ kind: 'press', info, key: 'Enter' }, 'input').action).toEqual({ type: 'press', selector: 'input', key: 'Enter' });
    const masked = eventToStep({ kind: 'fill', info, value: '', masked: true }, "getByLabel('Password')");
    expect(masked.action).toEqual({ type: 'fill', selector: "getByLabel('Password')", value: '{{password}}' });
    expect(masked.label).toMatch(/needs value/);
  });
});
