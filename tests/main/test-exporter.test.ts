import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestExporter } from '../../src/main/test-exporter';
import type { Step } from '../../src/shared/types';

vi.mock('@anthropic-ai/claude-code', () => ({
  claudeCode: vi.fn(),
}));

vi.mock('fs/promises', () => {
  const writeFile = vi.fn().mockResolvedValue(undefined);
  return { writeFile, default: { writeFile } };
});

import { claudeCode } from '@anthropic-ai/claude-code';
import { writeFile } from 'fs/promises';

describe('TestExporter', () => {
  let exporter: TestExporter;

  const mockSteps: Step[] = [
    { id: '1', label: 'Navigate to /login', action: { type: 'navigate', url: '/login' }, status: 'passed' },
    { id: '2', label: 'Fill email', action: { type: 'fill', selector: "getByLabel('Email')", value: 'test@test.com' }, status: 'passed' },
    { id: '3', label: 'Click Sign In', action: { type: 'click', selector: "getByRole('button', { name: 'Sign In' })" }, status: 'passed' },
    { id: '4', label: 'Assert dashboard URL', action: { type: 'assert', assertionType: 'url', expected: '/dashboard' }, status: 'passed' },
  ];

  beforeEach(() => {
    exporter = new TestExporter();
    vi.clearAllMocks();
  });

  it('generates a valid playwright test file from steps', async () => {
    const expectedCode = `import { test, expect } from '@playwright/test';

test.describe('Login flow', () => {
  test('should log in with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@test.com');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard');
  });
});`;

    vi.mocked(claudeCode).mockResolvedValue({
      content: [{ type: 'text', text: expectedCode }],
    } as any);

    const result = await exporter.exportSteps('Login flow', mockSteps, '/tmp/login.spec.ts');

    expect(writeFile).toHaveBeenCalledWith('/tmp/login.spec.ts', expectedCode, 'utf-8');
    expect(result).toBe('/tmp/login.spec.ts');
  });
});
