import type { TestSuite } from '../types';

export function migrateToSuite(data: any): TestSuite {
  if (Array.isArray(data.tests)) {
    return { id: data.id, name: data.name, beforeEach: data.beforeEach || [], tests: data.tests };
  }
  return {
    id: data.id, name: data.name, beforeEach: [],
    tests: [{ id: `block-${data.id}`, name: data.name, steps: data.steps || [] }],
  };
}
