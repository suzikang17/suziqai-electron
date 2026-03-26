import type { TestCase, StepAction } from '@shared/types';

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

export function generateSpec(test: TestCase, baseUrl?: string): string {
  const indent = '    ';
  const steps = test.steps
    .filter(s => s.status !== 'failed') // skip failed steps
    .map(s => `${indent}${actionToPlaywright(s.action)}`)
    .join('\n');

  const testName = test.name.replace(/'/g, "\\'");

  let code = `import { test, expect } from '@playwright/test';\n\n`;

  if (baseUrl) {
    code += `// Base URL: ${baseUrl}\n\n`;
  }

  code += `test.describe('${testName}', () => {\n`;
  code += `  test('${testName}', async ({ page }) => {\n`;
  code += steps || `${indent}// No steps yet`;
  code += `\n  });\n`;
  code += `});\n`;

  return code;
}

export function generateSpecFilename(test: TestCase): string {
  const slug = test.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  return `${slug}.spec.ts`;
}
