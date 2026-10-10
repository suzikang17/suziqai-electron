// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generateSpec, generateSpecFilename } from '../../src/shared/utils/generateSpec';
import type { TestSuite } from '../../src/shared/types';

describe('generateSpec', () => {
  it('generates a spec with describe, beforeEach, and multiple tests', () => {
    const suite: TestSuite = {
      id: 'suite-1', name: 'Login Feature', fileName: 'login-feature',
      beforeAll: [], beforeEach: [
        { id: 's0', label: 'Navigate', action: { type: 'navigate', url: '/login' }, status: 'passed' },
      ], afterEach: [], afterAll: [],
      tests: [
        { id: 'b1', name: 'valid login', steps: [
          { id: 's1', label: 'Fill email', action: { type: 'fill', selector: "getByLabel('Email')", value: 'test@test.com' }, status: 'passed' },
          { id: 's2', label: 'Click submit', action: { type: 'click', selector: "getByRole('button', { name: 'Sign In' })" }, status: 'passed' },
          { id: 's3', label: 'Assert URL', action: { type: 'assert', assertionType: 'url', expected: '/dashboard' }, status: 'passed' },
        ]},
        { id: 'b2', name: 'invalid login', steps: [
          { id: 's4', label: 'Fill bad email', action: { type: 'fill', selector: "getByLabel('Email')", value: 'bad@test.com' }, status: 'passed' },
          { id: 's5', label: 'Assert error', action: { type: 'assert', assertionType: 'visible', expected: '', selector: "getByText('Invalid')" }, status: 'passed' },
        ]},
      ],
      devices: [],
    };
    const code = generateSpec(suite);
    expect(code).toContain("import { test, expect } from '@playwright/test'");
    expect(code).toContain("test.describe('Login Feature'");
    expect(code).toContain("test.beforeEach(async ({ page })");
    expect(code).toContain("await page.goto('/login')");
    expect(code).toContain("test('valid login'");
    expect(code).toContain("test('invalid login'");
    expect(code).toContain("await page.getByLabel('Email').fill('test@test.com')");
    expect(code).toContain('await expect(page).toHaveURL(/\\/dashboard/);'); // contains, like the in-app check
  });

  it('omits beforeEach block when empty', () => {
    const suite: TestSuite = {
      id: 'suite-1', name: 'Simple', fileName: 'simple',
      beforeAll: [], beforeEach: [], afterEach: [], afterAll: [],
      tests: [{ id: 'b1', name: 'only test', steps: [
        { id: 's1', label: 'Navigate', action: { type: 'navigate', url: '/' }, status: 'passed' },
      ]}],
      devices: [],
    };
    const code = generateSpec(suite);
    expect(code).not.toContain('beforeEach');
    expect(code).toContain("test.describe('Simple'");
    expect(code).toContain("test('only test'");
  });

  it('exports press steps as locator.press(key)', () => {
    const suite: TestSuite = {
      id: 'suite-1', name: 'Todos', fileName: 'todos',
      beforeAll: [], beforeEach: [], afterEach: [], afterAll: [],
      tests: [{ id: 'b1', name: 'add todo', steps: [
        { id: 's1', label: 'Submit', action: { type: 'press', selector: "getByPlaceholder('What needs to be done?')", key: 'Enter' }, status: 'passed' },
      ]}],
      devices: [],
    };
    expect(generateSpec(suite)).toContain("await page.getByPlaceholder('What needs to be done?').press('Enter');");
  });

  it('skips failed steps', () => {
    const suite: TestSuite = {
      id: 'suite-1', name: 'Test', fileName: 'test',
      beforeAll: [], beforeEach: [], afterEach: [], afterAll: [],
      tests: [{ id: 'b1', name: 'test block', steps: [
        { id: 's1', label: 'Good', action: { type: 'navigate', url: '/' }, status: 'passed' },
        { id: 's2', label: 'Bad', action: { type: 'click', selector: 'missing' }, status: 'failed' },
      ]}],
      devices: [],
    };
    const code = generateSpec(suite);
    expect(code).toContain("await page.goto('/')");
    expect(code).not.toContain('missing');
  });

  it('generates flat spec when useProjects is true even with devices', () => {
    const suite: TestSuite = {
      id: 'suite-1', name: 'Responsive', fileName: 'responsive',
      beforeAll: [], afterEach: [], afterAll: [],
      beforeEach: [
        { id: 's0', label: 'Navigate', action: { type: 'navigate', url: '/' }, status: 'passed' },
      ],
      devices: [
        { name: 'iPhone 14' },
        { name: 'Desktop Chrome' },
      ],
      tests: [{ id: 'b1', name: 'renders correctly', steps: [
        { id: 's1', label: 'Assert visible', action: { type: 'assert', assertionType: 'visible', expected: '', selector: 'h1' }, status: 'passed' },
      ]}],
    };
    const code = generateSpec(suite, true);
    // Should NOT contain device wrapping
    expect(code).not.toContain("test.describe('iPhone 14'");
    expect(code).not.toContain("test.describe('Desktop Chrome'");
    expect(code).not.toContain("test.use(");
    expect(code).not.toContain("devices");
    // Should still contain the test content
    expect(code).toContain("import { test, expect } from '@playwright/test'");
    expect(code).toContain("test.describe('Responsive'");
    expect(code).toContain("test('renders correctly'");
    expect(code).toContain("test.beforeEach(async ({ page })");
  });

  it('wraps tests in device-specific describe blocks', () => {
    const suite: TestSuite = {
      id: 'suite-1', name: 'Responsive', fileName: 'responsive',
      beforeAll: [], afterEach: [], afterAll: [],
      beforeEach: [
        { id: 's0', label: 'Navigate', action: { type: 'navigate', url: '/' }, status: 'passed' },
      ],
      devices: [
        { name: 'iPhone 14' },
        { name: 'Custom', viewport: { width: 1280, height: 720 } },
      ],
      tests: [{ id: 'b1', name: 'renders correctly', steps: [
        { id: 's1', label: 'Assert visible', action: { type: 'assert', assertionType: 'visible', expected: '', selector: 'h1' }, status: 'passed' },
      ]}],
    };
    const code = generateSpec(suite);
    expect(code).toContain("import { test, expect, devices } from '@playwright/test'");
    expect(code).toContain("test.describe('iPhone 14'");
    expect(code).toContain("test.use({ ...devices['iPhone 14'] })");
    expect(code).toContain("test.describe('Custom'");
    expect(code).toContain("test.use({ viewport: { width: 1280, height: 720 } })");
  });
});

describe('generateSpecFilename', () => {
  it('generates a slug from suite name', () => {
    const suite: TestSuite = {
      id: '1', name: 'Login Feature', fileName: 'login-feature',
      beforeAll: [], beforeEach: [], afterEach: [], afterAll: [],
      tests: [],
      devices: [],
    };
    expect(generateSpecFilename(suite)).toBe('login-feature.spec.ts');
  });

  describe('assertions, env placeholders and read-only guard', () => {
    const step = (action: any) => ({ id: 'x', label: 'x', action, status: 'passed' as const });
    const suite = (steps: any[], beforeEach: any[] = []): TestSuite => ({
      id: 's', name: 'Board', fileName: 'board', beforeAll: [], beforeEach, afterEach: [], afterAll: [],
      tests: [{ id: 'b', name: 'board', steps }], devices: [],
    });
    const sel = "getByRole('button', { name: 'Week' })";

    it('exports every element state assertion instead of dropping it', () => {
      const code = generateSpec(suite([
        step({ type: 'assert', assertionType: 'disabled', expected: '', selector: sel }),
        step({ type: 'assert', assertionType: 'enabled', expected: '', selector: sel }),
        step({ type: 'assert', assertionType: 'checked', expected: '', selector: sel }),
        step({ type: 'assert', assertionType: 'unchecked', expected: '', selector: sel }),
        step({ type: 'assert', assertionType: 'focused', expected: '', selector: sel }),
        step({ type: 'assert', assertionType: 'editable', expected: '', selector: sel }),
        step({ type: 'assert', assertionType: 'empty', expected: '', selector: sel }),
        step({ type: 'assert', assertionType: 'count', expected: '3', selector: sel }),
      ]));
      for (const m of ['toBeDisabled()', 'toBeEnabled()', 'toBeChecked()', 'not.toBeChecked()', 'toBeFocused()', 'toBeEditable()', 'toBeEmpty()', 'toHaveCount(3)']) {
        expect(code).toContain(`await expect(page.${sel}).${m};`);
      }
      expect(code).not.toContain('Unknown assertion');
    });

    it('exports attribute assertions and URL patterns', () => {
      const code = generateSpec(suite([
        step({ type: 'assert', assertionType: 'attribute', attribute: 'aria-pressed', expected: 'true', selector: sel }),
        step({ type: 'assert', assertionType: 'url', expected: '/weekOf=\\d{4}-\\d{2}-\\d{2}/' }),
        step({ type: 'assert', assertionType: 'url', expected: '/dashboard' }),
      ]));
      expect(code).toContain(`await expect(page.${sel}).toHaveAttribute('aria-pressed', 'true');`);
      expect(code).toContain('await expect(page).toHaveURL(/weekOf=\\d{4}-\\d{2}-\\d{2}/);');
      expect(code).toContain("await expect(page).toHaveURL(/\\/dashboard/);");
    });

    it('reads {{env.NAME}} placeholders from process.env so secrets stay out of the file', () => {
      const code = generateSpec(suite([], [
        step({ type: 'navigate', url: 'https://app.example.com/auth' }),
        step({ type: 'fill', selector: "getByRole('textbox', { name: 'Email' })", value: '{{env.TPS_TEST_EMAIL}}' }),
      ]));
      expect(code).toContain("await page.getByRole('textbox', { name: 'Email' }).fill(process.env.TPS_TEST_EMAIL ?? '');");
      expect(code).not.toContain('{{env');
    });

    it('builds the read-only network guard into specs from read-only projects', () => {
      const code = generateSpec(suite([step({ type: 'navigate', url: 'https://x' })]), false, { readOnlyAllow: ['/auth/v1/token\\?grant_type=password'] });
      expect(code).toContain('READ_ONLY_ALLOW');
      expect(code).toContain("await context.route('**/*'");
      expect(code).toMatch(/blocked write/);
      expect(generateSpec(suite([step({ type: 'navigate', url: 'https://x' })]))).not.toContain('READ_ONLY_ALLOW');
    });
  });

  it('numbers duplicate test titles, which Playwright would otherwise reject', () => {
    const code = generateSpec({
      id: 's', name: 'S', fileName: 's', beforeAll: [], beforeEach: [], afterEach: [], afterAll: [], devices: [],
      tests: [{ id: 'a', name: 'Untitled Test', steps: [] }, { id: 'b', name: 'Untitled Test', steps: [] }, { id: 'c', name: 'Other', steps: [] }],
    });
    expect(code).toContain("test('Untitled Test', async");
    expect(code).toContain("test('Untitled Test (2)', async");
    expect(code).toContain("test('Other', async");
  });

  describe('hooks', () => {
    const step = (label: string, action: any) => ({ id: label, label, action, status: 'passed' as const });
    const hooked: TestSuite = {
      id: 's', name: 'Hooks', fileName: 'hooks', devices: [],
      beforeAll: [step('seed', { type: 'navigate', url: 'https://x/seed' })],
      beforeEach: [step('open', { type: 'navigate', url: 'https://x/' })],
      afterEach: [step('logout', { type: 'click', selector: "getByRole('button', { name: 'Log out' })" })],
      afterAll: [step('cleanup', { type: 'navigate', url: 'https://x/cleanup' })],
      tests: [{ id: 'b', name: 't', steps: [step('go', { type: 'click', selector: "getByRole('button', { name: 'Go' })" })] }],
    };

    it('exports all four hooks in Playwright order, giving beforeAll/afterAll their own page', () => {
      const code = generateSpec(hooked);
      const at = (s: string) => code.indexOf(s);
      expect(code).toMatch(/test\.beforeAll\(async \(\{ browser \}\) => \{\n\s+const page = await browser\.newPage\(\);\n\s+await page\.goto\('https:\/\/x\/seed'\);\n\s+await page\.close\(\);/);
      expect(code).toContain("test.afterEach(async ({ page }) => {");
      expect(code).toContain("await page.getByRole('button', { name: 'Log out' }).click();");
      expect(code).toMatch(/test\.afterAll\(async \(\{ browser \}\) => \{\n\s+const page = await browser\.newPage\(\);\n\s+await page\.goto\('https:\/\/x\/cleanup'\);/);
      expect(at('test.beforeAll')).toBeLessThan(at("test('t'"));
    });

    it('guards the beforeAll/afterAll pages in read-only projects too', () => {
      const code = generateSpec(hooked, false, { readOnlyAllow: ['/auth'] });
      expect(code).toMatch(/test\.beforeAll\(async \(\{ browser \}\) => \{\n\s+const context = await browser\.newContext\(\);\n\s+await guard\(context\);\n\s+const page = await context\.newPage\(\);/);
    });
  });
});
