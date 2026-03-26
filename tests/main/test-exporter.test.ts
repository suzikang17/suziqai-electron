// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { Step } from '../../src/shared/types';

const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, default: actual, spawn: mockSpawn };
});

vi.mock('fs/promises', () => {
  const writeFile = vi.fn().mockResolvedValue(undefined);
  return { writeFile, default: { writeFile } };
});

import { writeFile } from 'fs/promises';
import { TestExporter } from '../../src/main/test-exporter';

function createMockProc(stdout: string) {
  const proc = new EventEmitter() as any;
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  proc.stdout = stdoutEmitter;
  proc.stderr = stderrEmitter;
  proc.stdin = { write: vi.fn(), end: vi.fn() };

  const origOn = stdoutEmitter.on.bind(stdoutEmitter);
  stdoutEmitter.on = (event: string, listener: (...args: any[]) => void) => {
    origOn(event, listener);
    if (event === 'data') {
      setImmediate(() => {
        stdoutEmitter.emit('data', Buffer.from(stdout));
        proc.emit('close', 0);
      });
    }
    return stdoutEmitter;
  };

  return proc;
}

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
    mockSpawn.mockReset();
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

    mockSpawn.mockReturnValue(createMockProc(expectedCode));

    const result = await exporter.exportSteps('Login flow', mockSteps, '/tmp/login.spec.ts');

    expect(writeFile).toHaveBeenCalledWith('/tmp/login.spec.ts', expectedCode, 'utf-8');
    expect(result).toBe('/tmp/login.spec.ts');
  });
});
