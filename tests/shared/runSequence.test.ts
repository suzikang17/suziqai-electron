import { describe, it, expect } from 'vitest';
import { buildRunSequence } from '../../src/shared/utils/runSequence';
import type { TestSuite } from '../../src/shared/types';

const s = (id: string, status: 'pending' | 'passed' | 'failed' = 'pending') => ({ id, label: id, action: { type: 'screenshot' as const }, status });

describe('buildRunSequence', () => {
  it('wraps the test in its hooks in Playwright order and keeps previously failed steps', () => {
    const suite: TestSuite = {
      id: 's', name: 'n', fileName: 'n', devices: [],
      beforeAll: [s('ba')], beforeEach: [s('be')], afterEach: [s('ae')], afterAll: [s('aa')],
      tests: [{ id: 't', name: 't', steps: [s('one', 'passed'), s('two', 'failed')] }],
    };
    expect(buildRunSequence(suite, suite.tests[0]).map((x) => x.id)).toEqual(['ba', 'be', 'one', 'two', 'ae', 'aa']);
  });
});
