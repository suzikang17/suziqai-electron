// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { TestLibrary } from '../../src/main/test-library';
import type { TestSuite } from '../../src/shared/types';

describe('TestLibrary', () => {
  let tmpDir: string;
  let testOutputDir: string;
  let library: TestLibrary;

  const mockSuite: TestSuite = {
    id: 'suite-1',
    name: 'Login flow',
    beforeEach: [
      { id: 's0', label: 'Navigate to /login', action: { type: 'navigate', url: '/login' }, status: 'passed' },
    ],
    tests: [{
      id: 'block-1',
      name: 'valid login',
      steps: [
        { id: 's1', label: 'Click sign in', action: { type: 'click', selector: "getByRole('button', { name: 'Sign In' })" }, status: 'passed' },
      ],
    }],
  };

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'suziqai-lib-'));
    testOutputDir = path.join(tmpDir, 'tests');
    await mkdir(testOutputDir, { recursive: true });
    library = new TestLibrary(testOutputDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('save', () => {
    it('writes a .spec.ts and .suziqai.json file', async () => {
      const result = await library.save(mockSuite);

      expect(result.fileName).toBe('login-flow');
      expect(result.path).toBe(path.join(testOutputDir, 'login-flow.spec.ts'));

      const specContent = await readFile(path.join(testOutputDir, 'login-flow.spec.ts'), 'utf-8');
      expect(specContent).toContain("import { test, expect } from '@playwright/test'");
      expect(specContent).toContain('Login flow');

      const sidecarContent = JSON.parse(await readFile(path.join(testOutputDir, 'login-flow.suziqai.json'), 'utf-8'));
      expect(sidecarContent.id).toBe('suite-1');
      expect(sidecarContent.name).toBe('Login flow');
      expect(sidecarContent.tests).toHaveLength(1);
      expect(sidecarContent.beforeEach).toHaveLength(1);
      expect(sidecarContent.savedAt).toBeDefined();
      expect(sidecarContent.updatedAt).toBeDefined();
    });

    it('overwrites existing files when fileName is provided', async () => {
      const first = await library.save(mockSuite);
      const firstSidecar = JSON.parse(await readFile(path.join(testOutputDir, 'login-flow.suziqai.json'), 'utf-8'));
      const firstSavedAt = firstSidecar.savedAt;
      const firstUpdatedAt = firstSidecar.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 5));
      const updated = { ...mockSuite, name: 'Login flow v2' };
      const result = await library.save(updated, 'login-flow');

      expect(result.fileName).toBe('login-flow');
      const sidecar = JSON.parse(await readFile(path.join(testOutputDir, 'login-flow.suziqai.json'), 'utf-8'));
      expect(sidecar.name).toBe('Login flow v2');
      expect(sidecar.savedAt).toBe(firstSavedAt);
      expect(sidecar.updatedAt).toBeDefined();
      expect(sidecar.updatedAt).not.toBe(firstUpdatedAt);
    });

    it('appends numeric suffix on name collision', async () => {
      await library.save(mockSuite);
      const duplicate = { ...mockSuite, id: 'suite-2' };
      const result = await library.save(duplicate);

      expect(result.fileName).toBe('login-flow-2');
    });
  });

  describe('list', () => {
    it('returns empty array for empty directory', async () => {
      const entries = await library.list();
      expect(entries).toEqual([]);
    });

    it('lists saved tests with sidecar metadata', async () => {
      await library.save(mockSuite);
      const entries = await library.list();

      expect(entries).toHaveLength(1);
      expect(entries[0].fileName).toBe('login-flow');
      expect(entries[0].name).toBe('Login flow');
      expect(entries[0].stepCount).toBe(2);
      expect(entries[0].imported).toBe(false);
    });

    it('lists .spec.ts files without sidecars as imported', async () => {
      await writeFile(path.join(testOutputDir, 'legacy.spec.ts'), 'test code', 'utf-8');
      const entries = await library.list();

      expect(entries).toHaveLength(1);
      expect(entries[0].fileName).toBe('legacy');
      expect(entries[0].imported).toBe(true);
    });
  });

  describe('load', () => {
    it('loads a test from its sidecar file', async () => {
      await library.save(mockSuite);
      const loaded = await library.load('login-flow');

      expect(loaded.id).toBe('suite-1');
      expect(loaded.name).toBe('Login flow');
      expect(loaded.tests).toHaveLength(1);
      expect(loaded.beforeEach).toHaveLength(1);
    });

    it('throws when sidecar does not exist', async () => {
      await expect(library.load('nonexistent')).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('removes both .spec.ts and .suziqai.json files', async () => {
      await library.save(mockSuite);
      await library.delete('login-flow');

      const entries = await library.list();
      expect(entries).toHaveLength(0);
    });

    it('does not throw if files are already gone', async () => {
      await expect(library.delete('nonexistent')).resolves.not.toThrow();
    });
  });
});
