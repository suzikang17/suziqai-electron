// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generatePlaywrightConfig, defaultPlaywrightConfig } from '../../src/shared/utils/generatePlaywrightConfig';
import type { PlaywrightConfig } from '../../src/shared/types';

describe('generatePlaywrightConfig', () => {
  it('generates basic config with defaults', () => {
    const config = defaultPlaywrightConfig('http://localhost:3000', './tests');
    const output = generatePlaywrightConfig(config);

    expect(output).toContain("import { defineConfig } from '@playwright/test';");
    expect(output).toContain("testDir: './tests'");
    expect(output).toContain('timeout: 30000');
    expect(output).toContain('timeout: 5000');
    expect(output).toContain('retries: 0');
    expect(output).toContain("workers: '50%'");
    expect(output).toContain("reporter: 'html'");
    expect(output).toContain("baseURL: 'http://localhost:3000'");
    expect(output).toContain('headless: true');
    expect(output).toContain("screenshot: 'only-on-failure'");
    expect(output).toContain("video: 'off'");
    expect(output).toContain("trace: 'off'");
    // No projects key when empty
    expect(output).not.toContain('projects:');
  });

  it('generates config with device-based projects', () => {
    const config: PlaywrightConfig = {
      ...defaultPlaywrightConfig('http://localhost:3000', './tests'),
      projects: [
        { name: 'Desktop Chrome', device: 'Desktop Chrome' },
        { name: 'iPhone 14', device: 'iPhone 14' },
      ],
    };
    const output = generatePlaywrightConfig(config);

    expect(output).toContain("import { defineConfig, devices } from '@playwright/test';");
    expect(output).toContain('projects: [');
    expect(output).toContain("name: 'Desktop Chrome'");
    expect(output).toContain("use: { ...devices['Desktop Chrome'] }");
    expect(output).toContain("name: 'iPhone 14'");
    expect(output).toContain("use: { ...devices['iPhone 14'] }");
  });

  it('generates config with custom viewport project', () => {
    const config: PlaywrightConfig = {
      ...defaultPlaywrightConfig('http://localhost:3000', './tests'),
      projects: [
        { name: 'Custom 1280x720', viewport: { width: 1280, height: 720 } },
      ],
    };
    const output = generatePlaywrightConfig(config);

    // No devices import needed for viewport-only projects
    expect(output).toContain("import { defineConfig } from '@playwright/test';");
    expect(output).toContain("name: 'Custom 1280x720'");
    expect(output).toContain('use: { viewport: { width: 1280, height: 720 } }');
  });

  it('generates config with browser-specific project', () => {
    const config: PlaywrightConfig = {
      ...defaultPlaywrightConfig('http://localhost:3000', './tests'),
      projects: [
        { name: 'Firefox', browser: 'firefox' },
        { name: 'WebKit', browser: 'webkit' },
      ],
    };
    const output = generatePlaywrightConfig(config);

    expect(output).toContain("import { defineConfig, devices } from '@playwright/test';");
    expect(output).toContain("use: { ...devices['Desktop Firefox'] }");
    expect(output).toContain("use: { ...devices['Desktop Safari'] }");
  });

  it('generates config with non-default settings', () => {
    const config: PlaywrightConfig = {
      baseURL: 'https://staging.example.com',
      testDir: './e2e',
      projects: [],
      timeout: 60000,
      expectTimeout: 10000,
      retries: 2,
      workers: 4,
      reporter: 'json',
      use: {
        headless: false,
        screenshot: 'on',
        video: 'retain-on-failure',
        trace: 'on',
      },
    };
    const output = generatePlaywrightConfig(config);

    expect(output).toContain("testDir: './e2e'");
    expect(output).toContain('timeout: 60000');
    expect(output).toContain('timeout: 10000');
    expect(output).toContain('retries: 2');
    expect(output).toContain('workers: 4');
    expect(output).toContain("reporter: 'json'");
    expect(output).toContain("baseURL: 'https://staging.example.com'");
    expect(output).toContain('headless: false');
    expect(output).toContain("screenshot: 'on'");
    expect(output).toContain("video: 'retain-on-failure'");
    expect(output).toContain("trace: 'on'");
  });

  it('generates config with no projects (no projects key)', () => {
    const config = defaultPlaywrightConfig('http://localhost:3000', './tests');
    config.projects = [];
    const output = generatePlaywrightConfig(config);

    expect(output).not.toContain('projects');
    expect(output).not.toContain('devices');
  });

  it('generates config with mixed project types', () => {
    const config: PlaywrightConfig = {
      ...defaultPlaywrightConfig('http://localhost:3000', './tests'),
      projects: [
        { name: 'Desktop Chrome', device: 'Desktop Chrome' },
        { name: 'iPhone 14', device: 'iPhone 14' },
        { name: 'Custom 1280x720', viewport: { width: 1280, height: 720 } },
      ],
    };
    const output = generatePlaywrightConfig(config);

    // Needs devices import because some projects use device
    expect(output).toContain("import { defineConfig, devices } from '@playwright/test';");
    expect(output).toContain("use: { ...devices['Desktop Chrome'] }");
    expect(output).toContain("use: { ...devices['iPhone 14'] }");
    expect(output).toContain('use: { viewport: { width: 1280, height: 720 } }');
  });
});

describe('defaultPlaywrightConfig', () => {
  it('returns sensible defaults', () => {
    const config = defaultPlaywrightConfig('http://localhost:4000', './e2e');
    expect(config.baseURL).toBe('http://localhost:4000');
    expect(config.testDir).toBe('./e2e');
    expect(config.projects).toEqual([]);
    expect(config.timeout).toBe(30000);
    expect(config.expectTimeout).toBe(5000);
    expect(config.retries).toBe(0);
    expect(config.workers).toBe('50%');
    expect(config.reporter).toBe('html');
    expect(config.use.headless).toBe(true);
    expect(config.use.screenshot).toBe('only-on-failure');
    expect(config.use.video).toBe('off');
    expect(config.use.trace).toBe('off');
  });
});
