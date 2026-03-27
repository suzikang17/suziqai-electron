import { readdir, readFile, writeFile, unlink, mkdir, access } from 'fs/promises';
import path from 'path';
import type { TestCase, LibraryEntry } from '../shared/types';
import { generateSpec } from '../renderer/utils/generateSpec';

export class TestLibrary {
  constructor(private testOutputDir: string) {}

  async save(test: TestCase, fileName?: string): Promise<{ fileName: string; path: string }> {
    await mkdir(this.testOutputDir, { recursive: true });

    const resolvedName = fileName || await this.resolveFileName(test);
    const specPath = path.join(this.testOutputDir, `${resolvedName}.spec.ts`);
    const sidecarPath = path.join(this.testOutputDir, `${resolvedName}.suziqai.json`);

    // Generate spec file
    const specContent = generateSpec(test);
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
      id: test.id,
      name: test.name,
      steps: test.steps,
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
    const specFiles = files.filter(f => f.endsWith('.spec.ts'));
    const entries: LibraryEntry[] = [];

    for (const specFile of specFiles) {
      const fileName = specFile.replace('.spec.ts', '');
      const sidecarPath = path.join(this.testOutputDir, `${fileName}.suziqai.json`);

      try {
        await access(sidecarPath);
        const sidecar = JSON.parse(await readFile(sidecarPath, 'utf-8'));
        entries.push({
          fileName,
          name: sidecar.name || fileName,
          stepCount: Array.isArray(sidecar.steps) ? sidecar.steps.length : 0,
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

  async load(fileName: string): Promise<TestCase> {
    const sidecarPath = path.join(this.testOutputDir, `${fileName}.suziqai.json`);
    const data = JSON.parse(await readFile(sidecarPath, 'utf-8'));
    return {
      id: data.id,
      name: data.name,
      steps: data.steps,
    };
  }

  async delete(fileName: string): Promise<void> {
    const specPath = path.join(this.testOutputDir, `${fileName}.spec.ts`);
    const sidecarPath = path.join(this.testOutputDir, `${fileName}.suziqai.json`);

    await unlink(specPath).catch(() => {});
    await unlink(sidecarPath).catch(() => {});
  }

  private async resolveFileName(test: TestCase): Promise<string> {
    const base = this.slugify(test.name);
    let candidate = base;
    let counter = 2;

    while (true) {
      const specPath = path.join(this.testOutputDir, `${candidate}.spec.ts`);
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
