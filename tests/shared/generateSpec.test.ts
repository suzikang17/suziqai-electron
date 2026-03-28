// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generateSpec, generateSpecFilename } from '../../src/shared/utils/generateSpec';
import type { TestSuite } from '../../src/shared/types';

describe('generateSpec', () => {
  it('generates a spec with describe, beforeEach, and multiple tests', () => {
    const suite: TestSuite = {
      id: 'suite-1', name: 'Login Feature', fileName: 'login-feature',
      beforeEach: [
        { id: 's0', label: 'Navigate', action: { type: 'navigate', url: '/login' }, status: 'passed' },
      ],
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
      id: 'suite-1', name: 'Simple', fileName: 'simple', beforeEach: [],
      tests: [{ id: 'b1', name: 'only test', steps: [
        { id: 's1', label: 'Navigate', action: { type: 'navigate', url: '/' }, status: 'passed' },
      ]}],
    };
    const code = generateSpec(suite);
    expect(code).not.toContain('beforeEach');
    expect(code).toContain("test.describe('Simple'");
    expect(code).toContain("test('only test'");
  });

  it('skips failed steps', () => {
    const suite: TestSuite = {
      id: 'suite-1', name: 'Test', fileName: 'test', beforeEach: [],
      tests: [{ id: 'b1', name: 'test block', steps: [
        { id: 's1', label: 'Good', action: { type: 'navigate', url: '/' }, status: 'passed' },
        { id: 's2', label: 'Bad', action: { type: 'click', selector: 'missing' }, status: 'failed' },
      ]}],
    };
    const code = generateSpec(suite);
    expect(code).toContain("await page.goto('/')");
    expect(code).not.toContain('missing');
  });
});

describe('generateSpecFilename', () => {
  it('generates a slug from suite name', () => {
    const suite: TestSuite = { id: '1', name: 'Login Feature', fileName: 'login-feature', beforeEach: [], tests: [] };
    expect(generateSpecFilename(suite)).toBe('login-feature.spec.ts');
  });
});
