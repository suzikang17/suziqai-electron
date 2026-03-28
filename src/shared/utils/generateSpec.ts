import type { TestSuite, StepAction, DeviceConfig } from '@shared/types';

function actionToPlaywright(action: StepAction): string {
  switch (action.type) {
    case 'navigate':
      return `await page.goto('${action.url}');`;
    case 'click': {
      const sel = selectorToPlaywright(action.selector);
      return `await ${sel}.click();`;
    }
    case 'fill': {
      const sel = selectorToPlaywright(action.selector);
      return `await ${sel}.fill('${action.value.replace(/'/g, "\\'")}');`;
    }
    case 'assert': {
      switch (action.assertionType) {
        case 'url':
          return `await expect(page).toHaveURL('${action.expected}');`;
        case 'visible': {
          const sel = selectorToPlaywright(action.selector || '');
          return `await expect(${sel}).toBeVisible();`;
        }
        case 'text': {
          if (action.selector) {
            const sel = selectorToPlaywright(action.selector);
            return `await expect(${sel}).toContainText('${action.expected}');`;
          }
          return `await expect(page.locator('body')).toContainText('${action.expected}');`;
        }
        case 'hidden': {
          const sel = selectorToPlaywright(action.selector || '');
          return `await expect(${sel}).toBeHidden();`;
        }
        case 'value': {
          const sel = selectorToPlaywright(action.selector || '');
          return `await expect(${sel}).toHaveValue('${action.expected}');`;
        }
        default:
          return `// Unknown assertion type: ${(action as any).assertionType}`;
      }
    }
    case 'waitFor': {
      const sel = selectorToPlaywright(action.selector);
      return `await ${sel}.waitFor();`;
    }
    case 'screenshot':
      return `await page.screenshot();`;
    default:
      return `// Unknown action`;
  }
}

function selectorToPlaywright(selector: string): string {
  // If it already looks like a Playwright locator (getByText, getByRole, etc.), wrap with page.
  if (/^getBy(Text|Role|Label|TestId|Placeholder)\(/.test(selector)) {
    return `page.${selector}`;
  }
  // CSS selector
  return `page.locator('${selector.replace(/'/g, "\\'")}')`;
}

function generateDeviceUse(device: DeviceConfig, innerIndent: string): string {
  if (device.name === 'Custom' && device.viewport) {
    return `${innerIndent}test.use({ viewport: { width: ${device.viewport.width}, height: ${device.viewport.height} } });\n`;
  }
  return `${innerIndent}test.use({ ...devices['${device.name}'] });\n`;
}

function generateTestsBlock(suite: TestSuite, indent: string): string {
  let code = '';
  const innerIndent = indent + '    ';

  // beforeEach block (only if there are steps)
  if (suite.beforeEach.length > 0) {
    const beforeSteps = suite.beforeEach
      .filter(s => s.status !== 'failed')
      .map(s => `${innerIndent}${actionToPlaywright(s.action)}`)
      .join('\n');
    code += `${indent}test.beforeEach(async ({ page }) => {\n`;
    code += beforeSteps || `${innerIndent}// No steps yet`;
    code += `\n${indent}});\n\n`;
  }

  // individual test blocks
  for (const block of suite.tests) {
    const blockName = block.name.replace(/'/g, "\\'");
    const steps = block.steps
      .filter(s => s.status !== 'failed')
      .map(s => `${innerIndent}${actionToPlaywright(s.action)}`)
      .join('\n');
    code += `${indent}test('${blockName}', async ({ page }) => {\n`;
    code += steps || `${innerIndent}// No steps yet`;
    code += `\n${indent}});\n`;
  }

  return code;
}

export function generateSpec(suite: TestSuite): string {
  const suiteName = suite.name.replace(/'/g, "\\'");
  const hasDevices = suite.devices && suite.devices.length > 0;

  const importLine = hasDevices
    ? `import { test, expect, devices } from '@playwright/test';\n\n`
    : `import { test, expect } from '@playwright/test';\n\n`;

  let code = importLine;
  code += `test.describe('${suiteName}', () => {\n`;

  if (hasDevices) {
    for (const device of suite.devices) {
      const deviceName = device.name.replace(/'/g, "\\'");
      code += `  test.describe('${deviceName}', () => {\n`;
      code += generateDeviceUse(device, '    ');
      code += `\n`;
      code += generateTestsBlock(suite, '    ');
      code += `  });\n\n`;
    }
    // Remove trailing newline before closing brace
    code = code.trimEnd() + '\n';
  } else {
    code += generateTestsBlock(suite, '  ');
  }

  code += `});\n`;

  return code;
}

export function generateSpecFilename(suite: TestSuite): string {
  return `${suite.fileName || 'untitled'}.spec.ts`;
}
