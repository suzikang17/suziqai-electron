import { readFile, writeFile, mkdir, access } from 'fs/promises';
import path from 'path';
import type { ProjectConfig } from '../shared/types';

const DEFAULT_CONFIG: ProjectConfig = {
  baseUrl: 'http://localhost:3000',
  browser: 'chromium',
  testOutputDir: 'tests',
  locatorStrategy: 'recommended',
};

export class ProjectConfigManager {
  private projectPath: string = '';
  private config: ProjectConfig = { ...DEFAULT_CONFIG };

  async load(projectPath: string): Promise<ProjectConfig> {
    this.projectPath = projectPath;
    const configDir = path.join(projectPath, '.suziqai');
    const configPath = path.join(configDir, 'config.json');

    try {
      await access(configPath);
      const data = await readFile(configPath, 'utf-8');
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch {
      await mkdir(configDir, { recursive: true });
      await this.save();
    }

    return this.config;
  }

  async save(): Promise<void> {
    const configDir = path.join(this.projectPath, '.suziqai');
    const configPath = path.join(configDir, 'config.json');
    await mkdir(configDir, { recursive: true });
    await writeFile(configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  async update(partial: Partial<ProjectConfig>): Promise<ProjectConfig> {
    this.config = { ...this.config, ...partial };
    await this.save();
    return this.config;
  }

  async detectPlaywright(projectPath: string): Promise<boolean> {
    try {
      await access(path.join(projectPath, 'playwright.config.ts'));
      return true;
    } catch {
      try {
        await access(path.join(projectPath, 'playwright.config.js'));
        return true;
      } catch {
        return false;
      }
    }
  }

  getConfig(): ProjectConfig {
    return { ...this.config };
  }

  getProjectPath(): string {
    return this.projectPath;
  }
}
