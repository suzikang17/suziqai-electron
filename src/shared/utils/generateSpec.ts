import type { TestSuite, Step, StepAction, DeviceConfig } from '@shared/types';

export interface GenerateSpecOptions {
  /** Read-only projects: URL regexes the built-in network guard lets through (all else non-GET is blocked). */
  readOnlyAllow?: string[];
}

/** JS string literal; {{env.NAME}} placeholders become process.env reads so secrets stay out of the file. */
function jsString(value: string): string {
  if (!/\{\{env\.[A-Za-z_][A-Za-z0-9_]*\}\}/.test(value)) return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const whole = value.match(/^\{\{env\.([A-Za-z_][A-Za-z0-9_]*)\}\}$/);
  if (whole) return `process.env.${whole[1]} ?? ''`;
  const body = value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\{\{env\.([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (_, name) => `\${process.env.${name} ?? ''}`);
  return `\`${body}\``;
}

/** URL assertions: "/pattern/flags" is a regex; anything else means "URL contains this text". */
function urlMatcher(expected: string): string {
  if (/^\/.+\/[a-z]*$/.test(expected) && !/^\/[^/]*$/.test(expected)) return expected;
  return `/${expected.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/`;
}

function actionToPlaywright(action: StepAction): string {
  switch (action.type) {
    case 'navigate':
      return `await page.goto(${jsString(action.url)});`;
    case 'click':
      return `await ${selectorToPlaywright(action.selector)}.click();`;
    case 'fill':
      return `await ${selectorToPlaywright(action.selector)}.fill(${jsString(action.value)});`;
    case 'press':
      return `await ${selectorToPlaywright(action.selector)}.press(${jsString(action.key)});`;
    case 'assert': {
      const sel = selectorToPlaywright(action.selector || '');
      switch (action.assertionType) {
        case 'url':
          return `await expect(page).toHaveURL(${urlMatcher(action.expected)});`;
        case 'visible':
          return `await expect(${sel}).toBeVisible();`;
        case 'hidden':
          return `await expect(${sel}).toBeHidden();`;
        case 'text':
          return action.selector
            ? `await expect(${sel}).toContainText(${jsString(action.expected)});`
            : `await expect(page.locator('body')).toContainText(${jsString(action.expected)});`;
        case 'value':
          return `await expect(${sel}).toHaveValue(${jsString(action.expected)});`;
        case 'attribute':
          return `await expect(${sel}).toHaveAttribute(${jsString(action.attribute ?? '')}, ${jsString(action.expected)});`;
        case 'enabled':
          return `await expect(${sel}).toBeEnabled();`;
        case 'disabled':
          return `await expect(${sel}).toBeDisabled();`;
        case 'checked':
          return `await expect(${sel}).toBeChecked();`;
        case 'unchecked':
          return `await expect(${sel}).not.toBeChecked();`;
        case 'focused':
          return `await expect(${sel}).toBeFocused();`;
        case 'editable':
          return `await expect(${sel}).toBeEditable();`;
        case 'empty':
          return `await expect(${sel}).toBeEmpty();`;
        case 'count':
          return `await expect(${sel}).toHaveCount(${Number(action.expected) || 0});`;
      }
      return `// Unsupported assertion: ${(action as { assertionType: string }).assertionType}`;
    }
    case 'waitFor':
      return `await ${selectorToPlaywright(action.selector)}.waitFor();`;
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
  // CSS selector, keeping a trailing .first()/.last()/.nth(n) as a locator call
  const chain = selector.match(/^(.*?)((?:\.(?:first|last)\(\)|\.nth\(\d+\))+)$/);
  const css = chain ? chain[1] : selector;
  return `page.locator('${css.replace(/'/g, "\\'")}')${chain ? chain[2] : ''}`;
}

function readOnlyGuard(allow: string[], indent: string): string {
  const patterns = allow.map((p) => `${indent}  new RegExp(${JSON.stringify(p)}),`).join('\n');
  return `${indent}// Read-only project: every non-GET request is blocked except these (login, read-only RPCs)
${indent}const READ_ONLY_ALLOW = [
${patterns}
${indent}];
${indent}const blockedWrites: string[] = [];

${indent}async function guard(context: BrowserContext) {
${indent}  await context.route('**/*', (route) => {
${indent}    const request = route.request();
${indent}    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || READ_ONLY_ALLOW.some((re) => re.test(request.url()))) {
${indent}      return route.continue();
${indent}    }
${indent}    // Monitoring beacons are dropped quietly; anything else is a write attempt
${indent}    if (!/sentry\\.[^/]+\\/api\\/\\d+\\/envelope|\\/cdn-cgi\\/rum/.test(request.url())) {
${indent}      blockedWrites.push(\`\${request.method()} \${request.url().split('?')[0]}\`);
${indent}    }
${indent}    return route.abort('blockedbyclient');
${indent}  });
${indent}}

${indent}test.beforeEach(async ({ context }) => {
${indent}  blockedWrites.length = 0;
${indent}  await guard(context);
${indent}});

${indent}test.afterEach(() => {
${indent}  expect(blockedWrites, 'blocked write requests on a read-only project').toEqual([]);
${indent}});

`;
}

function generateDeviceUse(device: DeviceConfig, innerIndent: string): string {
  if (device.name === 'Custom' && device.viewport) {
    return `${innerIndent}test.use({ viewport: { width: ${device.viewport.width}, height: ${device.viewport.height} } });\n`;
  }
  return `${innerIndent}test.use({ ...devices['${device.name}'] });\n`;
}

function stepLines(steps: Step[], indent: string): string {
  return steps.filter((s) => s.status !== 'failed').map((s) => `${indent}${actionToPlaywright(s.action)}`).join('\n');
}

/** beforeAll/afterAll get no page fixture in Playwright: open one (guarded in read-only projects). */
function suiteHook(name: 'beforeAll' | 'afterAll', steps: Step[], indent: string, guarded: boolean): string {
  const inner = indent + '    ';
  const open = guarded
    ? `${inner}const context = await browser.newContext();\n${inner}await guard(context);\n${inner}const page = await context.newPage();\n`
    : `${inner}const page = await browser.newPage();\n`;
  const close = guarded ? `${inner}await context.close();` : `${inner}await page.close();`;
  return `${indent}test.${name}(async ({ browser }) => {\n${open}${stepLines(steps, inner)}\n${close}\n${indent}});\n\n`;
}

function generateTestsBlock(suite: TestSuite, indent: string, opts: GenerateSpecOptions): string {
  const guarded = !!opts.readOnlyAllow;
  let code = guarded ? readOnlyGuard(opts.readOnlyAllow!, indent) : '';
  const innerIndent = indent + '    ';

  if (suite.beforeAll.length > 0) code += suiteHook('beforeAll', suite.beforeAll, indent, guarded);

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
  if (suite.afterEach.length > 0) {
    code += `${indent}test.afterEach(async ({ page }) => {\n${stepLines(suite.afterEach, innerIndent)}\n${indent}});\n\n`;
  }
  if (suite.afterAll.length > 0) code += suiteHook('afterAll', suite.afterAll, indent, guarded);

  // individual test blocks (duplicate titles numbered: Playwright rejects repeats)
  const seen = new Map<string, number>();
  for (const block of suite.tests) {
    const count = (seen.get(block.name) ?? 0) + 1;
    seen.set(block.name, count);
    const title = count > 1 ? `${block.name} (${count})` : block.name;
    const blockName = title.replace(/'/g, "\\'");
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

export function generateSpec(suite: TestSuite, useProjects: boolean = false, opts: GenerateSpecOptions = {}): string {
  const suiteName = suite.name.replace(/'/g, "\\'");
  const hasDevices = suite.devices && suite.devices.length > 0;
  // When useProjects is true, devices are handled by playwright.config.ts projects,
  // so we skip the per-device describe wrapping even if devices are present.
  const wrapDevices = hasDevices && !useProjects;

  const names = ['test', 'expect', ...(wrapDevices ? ['devices'] : []), ...(opts.readOnlyAllow ? ['type BrowserContext'] : [])];
  const importLine = `import { ${names.join(', ')} } from '@playwright/test';\n\n`;

  let code = importLine;
  code += `test.describe('${suiteName}', () => {\n`;

  if (wrapDevices) {
    for (const device of suite.devices) {
      const deviceName = device.name.replace(/'/g, "\\'");
      code += `  test.describe('${deviceName}', () => {\n`;
      code += generateDeviceUse(device, '    ');
      code += `\n`;
      code += generateTestsBlock(suite, '    ', opts);
      code += `  });\n\n`;
    }
    // Remove trailing newline before closing brace
    code = code.trimEnd() + '\n';
  } else {
    code += generateTestsBlock(suite, '  ', opts);
  }

  code += `});\n`;

  return code;
}

export function generateSpecFilename(suite: TestSuite): string {
  return `${suite.fileName || 'untitled'}.spec.ts`;
}
