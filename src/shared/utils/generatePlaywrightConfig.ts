import type { PlaywrightConfig, PlaywrightProject } from '@shared/types';

const BROWSER_DEVICE_MAP: Record<string, string> = {
  chromium: 'Desktop Chrome',
  firefox: 'Desktop Firefox',
  webkit: 'Desktop Safari',
};

function formatProjectUse(project: PlaywrightProject): string {
  if (project.device) {
    return `{ ...devices['${project.device}'] }`;
  }
  if (project.viewport) {
    return `{ viewport: { width: ${project.viewport.width}, height: ${project.viewport.height} } }`;
  }
  if (project.browser) {
    const deviceName = BROWSER_DEVICE_MAP[project.browser] || 'Desktop Chrome';
    return `{ ...devices['${deviceName}'] }`;
  }
  return `{}`;
}

function needsDevicesImport(projects: PlaywrightProject[]): boolean {
  return projects.some(p => p.device || p.browser);
}

export function generatePlaywrightConfig(config: PlaywrightConfig): string {
  const hasProjects = config.projects && config.projects.length > 0;
  const usesDevices = hasProjects && needsDevicesImport(config.projects);

  const imports = usesDevices
    ? `import { defineConfig, devices } from '@playwright/test';`
    : `import { defineConfig } from '@playwright/test';`;

  let code = `${imports}\n\nexport default defineConfig({\n`;
  code += `  testDir: '${config.testDir}',\n`;
  code += `  timeout: ${config.timeout},\n`;
  code += `  expect: {\n`;
  code += `    timeout: ${config.expectTimeout},\n`;
  code += `  },\n`;
  code += `  retries: ${config.retries},\n`;

  // workers: number or string
  if (typeof config.workers === 'number') {
    code += `  workers: ${config.workers},\n`;
  } else {
    code += `  workers: '${config.workers}',\n`;
  }

  code += `  reporter: '${config.reporter}',\n`;
  code += `  use: {\n`;
  code += `    baseURL: '${config.baseURL}',\n`;
  code += `    headless: ${config.use.headless},\n`;
  code += `    screenshot: '${config.use.screenshot}',\n`;
  code += `    video: '${config.use.video}',\n`;
  code += `    trace: '${config.use.trace}',\n`;
  code += `  },\n`;

  if (hasProjects) {
    code += `  projects: [\n`;
    for (const project of config.projects) {
      const use = formatProjectUse(project);
      code += `    {\n`;
      code += `      name: '${project.name}',\n`;
      code += `      use: ${use},\n`;
      code += `    },\n`;
    }
    code += `  ],\n`;
  }

  code += `});\n`;

  return code;
}

export function defaultPlaywrightConfig(baseURL: string, testDir: string): PlaywrightConfig {
  return {
    baseURL,
    testDir,
    projects: [],
    timeout: 30000,
    expectTimeout: 5000,
    retries: 0,
    workers: '50%',
    reporter: 'html',
    use: {
      headless: true,
      screenshot: 'only-on-failure',
      video: 'off',
      trace: 'off',
    },
  };
}
