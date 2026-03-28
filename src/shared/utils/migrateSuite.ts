import type { TestSuite } from '../types';

export function migrateToSuite(data: any): TestSuite {
  if (Array.isArray(data.tests)) {
    return {
      id: data.id,
      name: data.name,
      fileName: data.fileName || data.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled',
      beforeAll: data.beforeAll || [],
      beforeEach: data.beforeEach || [],
      afterEach: data.afterEach || [],
      afterAll: data.afterAll || [],
      tests: data.tests,
      devices: data.devices || [],
    };
  }
  return {
    id: data.id,
    name: data.name,
    fileName: data.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled',
    beforeAll: [],
    beforeEach: [],
    afterEach: [],
    afterAll: [],
    tests: [{ id: `block-${data.id}`, name: data.name, steps: data.steps || [] }],
    devices: [],
  };
}
