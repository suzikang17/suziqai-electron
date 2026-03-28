import type { TestSuite, StepAction } from '@shared/types';

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

export function generateSpec(suite: TestSuite): string {
  const indent = '    ';
  const suiteName = suite.name.replace(/'/g, "\\'");

  let code = `import { test, expect } from '@playwright/test';\n\n`;

  code += `test.describe('${suiteName}', () => {\n`;

  // beforeEach block (only if there are steps)
  if (suite.beforeEach.length > 0) {
    const beforeSteps = suite.beforeEach
      .filter(s => s.status !== 'failed')
      .map(s => `${indent}${actionToPlaywright(s.action)}`)
      .join('\n');
    code += `  test.beforeEach(async ({ page }) => {\n`;
    code += beforeSteps || `${indent}// No steps yet`;
    code += `\n  });\n\n`;
  }

  // individual test blocks
  for (const block of suite.tests) {
    const blockName = block.name.replace(/'/g, "\\'");
    const steps = block.steps
      .filter(s => s.status !== 'failed')
      .map(s => `${indent}${actionToPlaywright(s.action)}`)
      .join('\n');
    code += `  test('${blockName}', async ({ page }) => {\n`;
    code += steps || `${indent}// No steps yet`;
    code += `\n  });\n`;
  }

  code += `});\n`;

  return code;
}

export function generateSpecFilename(suite: TestSuite): string {
  const slug = suite.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  return `${slug}.spec.ts`;
}
