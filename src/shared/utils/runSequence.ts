import type { Step, TestBlock, TestSuite } from '@shared/types';

/**
 * The steps one test runs, in Playwright's order: beforeAll, beforeEach, the test, afterEach,
 * afterAll. Running a single test in the app mirrors running it alone in CI. Every step runs —
 * including ones that failed last time.
 */
export function buildRunSequence(suite: TestSuite, block: TestBlock): Step[] {
  return [...suite.beforeAll, ...suite.beforeEach, ...block.steps, ...suite.afterEach, ...suite.afterAll];
}
