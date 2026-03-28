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
    expect(code).toContain("await expect(page).toHaveURL('/dashboard')");
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
});
