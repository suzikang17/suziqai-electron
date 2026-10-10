// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { importSpec } from '../../src/main/spec-importer';

const SPEC = `
import { test, expect } from '@playwright/test';
import { safeClick } from './helpers/guard';

const PROD_URL = 'https://app.example.com';

async function openBoard(browser, path = '/schedule-board') {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto(\`\${PROD_URL}\${path}\`);
  await expect(page.getByRole('button', { name: 'New Job Order' })).toBeVisible({ timeout: 30_000 });
  return { page, context };
}

test.beforeAll(async ({ browser }) => {
  const { email, password } = requireProdCredentials();
  const page = await browser.newPage();
  await page.goto(\`\${PROD_URL}/auth\`);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Log In' }).click();
});

test.describe('Schedule Board', () => {
  test('loads with controls', async ({ browser }, testInfo) => {
    const { page, guard, context } = await openBoard(browser);
    await expect(page.locator('[data-job-order-id]').first()).toBeVisible({ timeout: 30_000 });
    for (const name of ['Week', 'Day']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await assertNoBlockedWrites(guard, testInfo);
  });

  test('New Job Order validation', async ({ browser }) => {
    const { page } = await openBoard(browser);
    await safeClick(page.getByRole('button', { name: 'New Job Order' }));
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Next' })).toBeDisabled();
    await dialog.getByRole('textbox', { name: 'Job Order Title *' }).fill('[check]');
    await expect(dialog.getByRole('textbox', { name: "It's" })).toHaveValue('x');
    await safeClick(dialog.getByRole('button', { name: 'Cancel' }));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Oct/ })).toBeVisible();
  });
});
`;

describe('importSpec', () => {
  const { suite, skipped } = importSpec(SPEC, 'job-orders.spec.ts');
  const block = (name: string) => suite.tests.find((b) => b.name === name)!;
  const brief = (name: string) =>
    block(name).steps.map((s) => {
      const a = s.action as any;
      return [a.type, a.assertionType ?? '', a.selector ?? a.url ?? '', a.value ?? a.expected ?? a.key ?? ''].join(' | ');
    });

  it('names the suite after the describe and makes a block per test', () => {
    expect(suite.name).toBe('Schedule Board');
    expect(suite.fileName).toBe('job-orders');
    expect(suite.tests.map((b) => b.name)).toEqual(['loads with controls', 'New Job Order validation']);
  });

  it('inlines same-file helpers with default params and resolves constants in URLs', () => {
    expect(brief('loads with controls').slice(0, 2)).toEqual([
      'navigate |  | https://app.example.com/schedule-board | ',
      "assert | visible | getByRole('button', { name: 'New Job Order' }) | ",
    ]);
  });

  it('turns locators into selectors, including css locators and unrolled loops', () => {
    expect(brief('loads with controls').slice(2)).toEqual([
      'assert | visible | [data-job-order-id].first() | ',
      "assert | visible | getByRole('button', { name: 'Week', exact: true }) | ",
      "assert | visible | getByRole('button', { name: 'Day', exact: true }) | ",
    ]);
  });

  it('maps safeClick, fill, scoped locators, assertion kinds and keyboard presses', () => {
    expect(brief('New Job Order validation').slice(2)).toEqual([
      "click |  | getByRole('button', { name: 'New Job Order' }) | ",
      "assert | disabled | getByRole('button', { name: 'Next' }) | ",
      "fill |  | getByRole('textbox', { name: 'Job Order Title *' }) | [check]",
      `assert | value | getByRole('textbox', { name: "It's" }) | x`,
      "click |  | getByRole('button', { name: 'Cancel' }) | ",
      "assert | hidden | getByRole('dialog') | ",
      'press |  | body | Escape',
    ]);
  });

  it('puts beforeAll steps in the suite hook, flagging values it cannot know', () => {
    const steps = suite.beforeAll.map((s) => s.action as any);
    expect(steps.map((a) => a.type)).toEqual(['navigate', 'fill', 'click']);
    expect(steps[1].value).toBe('{{email}}');
    expect(suite.beforeAll[1].label).toMatch(/needs value/);
  });

  it('reports page interactions and assertions it could not convert, not test plumbing', () => {
    expect(skipped.map((s) => s.code)).toEqual(["await expect(page.getByRole('button', { name: /^Oct/ })).toBeVisible();"]);
    expect(skipped[0].line).toBe(SPEC.split('\n').findIndex((l) => l.includes('/^Oct/')) + 1);
  });
});

describe('importSpec — imported constants', () => {
  it('resolves string constants imported from relative modules', () => {
    const spec = `
import { test } from '@playwright/test';
import { PROD_URL, OTHER } from './helpers/guard';
test('opens', async ({ page }) => {
  await page.goto(\`\${PROD_URL}/board\`);
});
`;
    const modules: Record<string, string> = {
      './helpers/guard': "export const PROD_URL = 'https://app.example.com';\nexport const OTHER = 1;",
    };
    const { suite } = importSpec(spec, '/repo/tests/x.spec.ts', (rel) => modules[rel] ?? null);
    expect(suite.tests[0].steps[0].action).toEqual({ type: 'navigate', url: 'https://app.example.com/board' });
  });
});
