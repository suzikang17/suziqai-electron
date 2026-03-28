// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { IPC } from '../../src/shared/types';
import type { LibraryEntry, TestBlock, TestSuite } from '../../src/shared/types';

describe('Library types', () => {
  it('exports library IPC channel constants', () => {
    expect(IPC.LIBRARY_LIST).toBe('library:list');
    expect(IPC.LIBRARY_SAVE).toBe('library:save');
    expect(IPC.LIBRARY_LOAD).toBe('library:load');
    expect(IPC.LIBRARY_DELETE).toBe('library:delete');
  });

  it('LibraryEntry type is usable', () => {
    const entry: LibraryEntry = {
      fileName: 'login-flow',
      name: 'Login flow',
      stepCount: 3,
      savedAt: '2026-03-27T10:00:00Z',
      updatedAt: '2026-03-27T10:00:00Z',
      imported: false,
    };
    expect(entry.fileName).toBe('login-flow');
    expect(entry.imported).toBe(false);
  });
});

describe('TestSuite types', () => {
  it('TestBlock type is usable', () => {
    const block: TestBlock = { id: 'block-1', name: 'valid login', steps: [] };
    expect(block.name).toBe('valid login');
  });

  it('TestSuite type is usable', () => {
    const suite: TestSuite = {
      id: 'suite-1', name: 'Login Feature', beforeEach: [],
      tests: [{ id: 'block-1', name: 'valid login', steps: [] }],
    };
    expect(suite.name).toBe('Login Feature');
    expect(suite.tests).toHaveLength(1);
    expect(suite.beforeEach).toEqual([]);
  });
});
