import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectConfigManager } from '../../src/main/project-config';
import path from 'path';

vi.mock('fs/promises', () => {
  const readFile = vi.fn();
  const writeFile = vi.fn().mockResolvedValue(undefined);
  const mkdir = vi.fn().mockResolvedValue(undefined);
  const access = vi.fn();
  return { readFile, writeFile, mkdir, access, default: { readFile, writeFile, mkdir, access } };
});

import { readFile, writeFile, mkdir, access } from 'fs/promises';

describe('ProjectConfigManager', () => {
  let manager: ProjectConfigManager;

  beforeEach(() => {
    manager = new ProjectConfigManager();
    vi.clearAllMocks();
  });

  it('creates default config when none exists', async () => {
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const config = await manager.load('/projects/myapp');

    expect(config.baseUrl).toBe('http://localhost:3000');
    expect(config.browser).toBe('chromium');
    expect(config.testOutputDir).toBe('tests');
    expect(mkdir).toHaveBeenCalledWith(path.join('/projects/myapp', '.suziqai'), { recursive: true });
  });

  it('reads existing config', async () => {
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({
      baseUrl: 'http://localhost:8080',
      browser: 'firefox',
      testOutputDir: 'e2e',
      locatorStrategy: 'testid',
    }));

    const config = await manager.load('/projects/myapp');

    expect(config.baseUrl).toBe('http://localhost:8080');
    expect(config.browser).toBe('firefox');
    expect(config.testOutputDir).toBe('e2e');
  });

  it('detects existing playwright config', async () => {
    vi.mocked(access).mockImplementation(async (p) => {
      if (String(p).includes('playwright.config')) return undefined;
      throw new Error('ENOENT');
    });
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const hasPlaywright = await manager.detectPlaywright('/projects/myapp');
    expect(hasPlaywright).toBe(true);
  });
});
