import type { TestSuite } from '../types';

export function migrateToSuite(data: any): TestSuite {
  if (Array.isArray(data.tests)) {
    return {
      id: data.id,
      name: data.name,
      fileName: data.fileName || data.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled',
      beforeEach: data.beforeEach || [],
      tests: data.tests,
    };
  }
  return {
    id: data.id,
    name: data.name,
    fileName: data.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled',
    beforeEach: [],
    tests: [{ id: `block-${data.id}`, name: data.name, steps: data.steps || [] }],
  };
}
