// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { migrateToSuite } from '../../src/shared/utils/migrateSuite';
import type { TestCase, TestSuite } from '../../src/shared/types';

describe('migrateToSuite', () => {
  it('converts a TestCase to a TestSuite with one TestBlock', () => {
    const testCase: TestCase = {
      id: 'test-1', name: 'Login flow',
      steps: [
        { id: 's1', label: 'Navigate', action: { type: 'navigate', url: '/login' }, status: 'passed' },
        { id: 's2', label: 'Click', action: { type: 'click', selector: 'button' }, status: 'pending' },
      ],
    };
    const suite = migrateToSuite(testCase);
    expect(suite.id).toBe('test-1');
    expect(suite.name).toBe('Login flow');
    expect(suite.beforeEach).toEqual([]);
    expect(suite.tests).toHaveLength(1);
    expect(suite.tests[0].name).toBe('Login flow');
    expect(suite.tests[0].steps).toHaveLength(2);
  });

  it('passes through a TestSuite unchanged', () => {
    const suite: TestSuite = {
      id: 'suite-1', name: 'My Suite', beforeEach: [],
      tests: [{ id: 'b1', name: 'test 1', steps: [] }],
    };
    const result = migrateToSuite(suite as any);
    expect(result.id).toBe('suite-1');
    expect(result.tests).toHaveLength(1);
  });

  it('detects old format by presence of steps array', () => {
    const oldFormat = { id: '1', name: 'Old', steps: [] };
    const result = migrateToSuite(oldFormat as any);
    expect(result.tests).toBeDefined();
    expect(result.beforeEach).toBeDefined();
  });
});
