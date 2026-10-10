import { readdir, readFile, writeFile, unlink, mkdir, access } from 'fs/promises';
import path from 'path';
import type { TestSuite, LibraryEntry, PlaywrightConfig } from '../shared/types';
import { generateSpec } from '../shared/utils/generateSpec';
import { generatePlaywrightConfig } from '../shared/utils/generatePlaywrightConfig';
import { generateXCUITest, type XCUITestOptions } from '../shared/utils/generateXCUITest';
import { importSpec } from './spec-importer';

export class TestLibrary {
  /** iOS projects (ios set) save XCUITest .swift files; web projects save Playwright .spec.ts. */
  constructor(private testOutputDir: string, private ios?: XCUITestOptions) {}

  private get ext(): string {
    return this.ios ? '.swift' : '.spec.ts';
  }

  async save(suite: TestSuite, fileName?: string, useProjects: boolean = false): Promise<{ fileName: string; path: string }> {
    await mkdir(this.testOutputDir, { recursive: true });

    const resolvedName = fileName || await this.resolveFileName(suite, suite.fileName);
    const specPath = path.join(this.testOutputDir, `${resolvedName}${this.ext}`);
    const sidecarPath = path.join(this.testOutputDir, `${resolvedName}.suziqai.json`);

    // suziQai writes a sidecar with every spec it saves; a spec without one is hand-written
    // (possibly with safety guards, like live read-only suites) and must never be overwritten
    const specExists = await access(specPath).then(() => true, () => false);
    const sidecarExists = await access(sidecarPath).then(() => true, () => false);
    if (specExists && !sidecarExists) {
      throw new Error(`${resolvedName}${this.ext} is a hand-written test; suziQai won't overwrite it. Save under a new name.`);
    }

    // Generate the test file — when useProjects is true, skip device wrapping
    const specContent = this.ios ? generateXCUITest(suite, this.ios) : generateSpec(suite, useProjects);
    await writeFile(specPath, specContent, 'utf-8');

    // Read existing sidecar for savedAt, or use now
    let savedAt: string;
    try {
      const existing = JSON.parse(await readFile(sidecarPath, 'utf-8'));
      savedAt = existing.savedAt || new Date().toISOString();
    } catch {
      savedAt = new Date().toISOString();
    }

    // Write sidecar
    const sidecar = {
      id: suite.id,
      name: suite.name,
      fileName: resolvedName,
      beforeEach: suite.beforeEach,
      tests: suite.tests,
      devices: suite.devices,
      savedAt,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf-8');

    return { fileName: resolvedName, path: specPath };
  }

  async list(): Promise<LibraryEntry[]> {
    try {
      await access(this.testOutputDir);
    } catch {
      return [];
    }

    const files = await readdir(this.testOutputDir);
    const specFiles = files.filter(f => f.endsWith(this.ext));
    const entries: LibraryEntry[] = [];

    for (const specFile of specFiles) {
      const fileName = specFile.slice(0, -this.ext.length);
      const sidecarPath = path.join(this.testOutputDir, `${fileName}.suziqai.json`);

      try {
        await access(sidecarPath);
        const sidecar = JSON.parse(await readFile(sidecarPath, 'utf-8'));
        const beforeEachCount = Array.isArray(sidecar.beforeEach) ? sidecar.beforeEach.length : 0;
        const testStepCount = Array.isArray(sidecar.tests)
          ? sidecar.tests.reduce((sum: number, t: any) => sum + (Array.isArray(t.steps) ? t.steps.length : 0), 0)
          : 0;
        entries.push({
          fileName,
          name: sidecar.name || fileName,
          stepCount: beforeEachCount + testStepCount,
          savedAt: sidecar.savedAt || '',
          updatedAt: sidecar.updatedAt || '',
          imported: false,
        });
      } catch {
        entries.push({
          fileName,
          name: fileName,
          stepCount: 0,
          savedAt: '',
          updatedAt: '',
          imported: true,
        });
      }
    }

    return entries;
  }

  async load(fileName: string): Promise<TestSuite> {
    const sidecarPath = path.join(this.testOutputDir, `${fileName}.suziqai.json`);
    const sidecar = await readFile(sidecarPath, 'utf-8').catch(() => null);
    if (sidecar === null && !this.ios) {
      // Hand-written Playwright spec: import its steps
      const specPath = path.join(this.testOutputDir, `${fileName}.spec.ts`);
      const { suite, skipped } = importSpec(await readFile(specPath, 'utf-8'), specPath);
      return { ...suite, importNotes: skipped.map((s) => `Line ${s.line} not imported: ${s.code}`) };
    }
    if (sidecar === null) throw new Error(`No saved suite "${fileName}"`);
    const data = JSON.parse(sidecar);
    return {
      id: data.id,
      name: data.name,
      fileName: data.fileName || fileName,
      beforeAll: data.beforeAll || [],
      beforeEach: data.beforeEach || [],
      afterEach: data.afterEach || [],
      afterAll: data.afterAll || [],
      tests: data.tests || [],
      devices: data.devices || [],
    };
  }

  async savePlaywrightConfig(config: PlaywrightConfig, projectPath: string): Promise<void> {
    const configContent = generatePlaywrightConfig(config);
    const configPath = path.join(projectPath, 'playwright.config.ts');
    await writeFile(configPath, configContent, 'utf-8');
  }

  async delete(fileName: string): Promise<void> {
    const specPath = path.join(this.testOutputDir, `${fileName}${this.ext}`);
    const sidecarPath = path.join(this.testOutputDir, `${fileName}.suziqai.json`);
    const exists = (p: string) => access(p).then(() => true, () => false);
    if ((await exists(specPath)) && !(await exists(sidecarPath))) {
      throw new Error(`${fileName}${this.ext} is a hand-written test; suziQai won't delete it.`);
    }

    await unlink(specPath).catch(() => {});
    await unlink(sidecarPath).catch(() => {});
  }

  private async resolveFileName(suite: TestSuite, preferredBase?: string): Promise<string> {
    const base = preferredBase || this.slugify(suite.name);
    let candidate = base;
    let counter = 2;

    while (true) {
      const specPath = path.join(this.testOutputDir, `${candidate}${this.ext}`);
      try {
        await access(specPath);
        candidate = `${base}-${counter}`;
        counter++;
      } catch {
        return candidate;
      }
    }
  }

  private slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  }
}
