import type { Browser, Locator, Page } from 'playwright';
import { swipeVector } from '../shared/utils/swipe';
import { parseLocatorChain } from './locator-parser';

const CDP_PORT = parseInt(process.env.SUZIQAI_CDP_PORT || '9222', 10);

let browser: Browser | null = null;
let connectPromise: Promise<Page> | null = null;

async function getChromium() {
  const pw = await import('playwright');
  return pw.chromium;
}

function isAppPage(url: string): boolean {
  return (
    url.includes('localhost:5173') ||
    url.startsWith('file://') ||
    url.startsWith('devtools://') ||
    url.startsWith('chrome://')
  );
}

/**
 * The BrowserView's page among all CDP pages: never the app UI or devtools.
 * Prefers `expectedUrl` when given, then a non-blank page.
 */
export function pickTargetPage<P extends { url(): string }>(pages: P[], expectedUrl?: string): P | null {
  const views = pages.filter((p) => !isAppPage(p.url()));
  if (expectedUrl) {
    const match = views.find((p) => p.url() === expectedUrl);
    if (match) return match;
  }
  return views.find((p) => p.url() !== 'about:blank') ?? views[views.length - 1] ?? null;
}

let expectedUrlProvider: (() => string | undefined) | null = null;

/** Lets main.ts report the active BrowserView's URL so the right CDP page is chosen. */
export function setExpectedUrlProvider(fn: () => string | undefined): void {
  expectedUrlProvider = fn;
}

function findTargetPage(b: Browser): Page | null {
  return pickTargetPage(b.contexts().flatMap((c) => c.pages()), expectedUrlProvider?.());
}

let cachedPage: Page | null = null;

/**
 * Connect Playwright to the Electron app via CDP.
 * Reuses existing connection if still alive. Reconnects with retry on failure.
 */
export async function connectToElectron(): Promise<Page> {
  if (connectPromise) return connectPromise;
  connectPromise = _connectToElectron();
  try {
    return await connectPromise;
  } finally {
    connectPromise = null;
  }
}

async function _connectToElectron(): Promise<Page> {
  // Reuse if connection and page are still alive
  const expectedUrl = expectedUrlProvider?.();
  if (
    browser && browser.isConnected() && cachedPage && !cachedPage.isClosed() &&
    (!expectedUrl || cachedPage.url() === expectedUrl)
  ) {
    return cachedPage;
  }

  // Close stale connection
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    cachedPage = null;
  }

  // Retry up to 3 times with delay
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const chromium = await getChromium();
      browser = await chromium.connectOverCDP('http://127.0.0.1:' + CDP_PORT);

      const page = findTargetPage(browser);
      if (!page) throw new Error('No suitable page found via CDP');
      console.log('[suziQai] Connected to CDP page:', page.url());
      cachedPage = page;

      // Auto-clear cache when connection drops
      browser.on('disconnected', () => {
        browser = null;
        cachedPage = null;
      });

      return page;
    } catch (err) {
      console.error(`[suziQai] CDP connect attempt ${attempt + 1} failed:`, err);
      if (attempt < 2) await new Promise(r => setTimeout(r, 500));
    }
  }

  throw new Error('Failed to connect to browser via CDP after 3 attempts');
}

/**
 * Disconnect Playwright from the Electron app.
 */
export async function disconnectPlaywright(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}


/**
 * Execute a step action using Playwright's native API.
 */
export async function executeActionOnView(_view: any, action: any, timeout: number = 5000): Promise<void> {
  await executeOnPage(await connectToElectron(), action, timeout, _view);
}

/**
 * Where a navigate step goes. Paths ("/schedule-board") resolve against the current page, as
 * Playwright's page.goto resolves them against baseURL; a bare host ("example.com/x") gets http://.
 */
export function resolveNavigationUrl(target: string, currentUrl: string): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(target) || /^(about|data|file):/i.test(target)) return target;
  if (target.startsWith('/') || target.startsWith('.') || target.startsWith('?')) {
    if (!/^https?:/.test(currentUrl)) throw new Error(`Can't open "${target}": no page is open to resolve the path against`);
    return new URL(target, currentUrl).toString();
  }
  return 'http://' + target;
}

/** {{env.NAME}} placeholders keep secrets out of saved steps; resolved from the environment at run time. */
export function resolveEnv(value: string): string {
  return value.replace(/\{\{env\.([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (_, name) => process.env[name] ?? '');
}

export async function executeOnPage(p: Page, action: any, timeout: number = 5000, _view?: any): Promise<void> {

  switch (action.type) {
    case 'navigate': {
      const url = resolveNavigationUrl(resolveEnv(action.url), p.url());
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout });
      break;
    }

    case 'click': {
      console.log('[suziQai] Click action on page:', p.url(), 'selector:', action.selector);
      const locator = resolveLocator(p, action.selector);
      const count = await locator.count();
      console.log('[suziQai] Found', count, 'elements matching selector');
      await locator.scrollIntoViewIfNeeded({ timeout });
      await locator.click({ timeout });
      console.log('[suziQai] Click completed, page now:', p.url());
      break;
    }

    case 'fill': {
      const locator = resolveLocator(p, action.selector);
      await locator.fill(resolveEnv(action.value || ''), { timeout });
      break;
    }

    case 'press': {
      const locator = resolveLocator(p, action.selector);
      await locator.press(action.key || 'Enter', { timeout });
      break;
    }

    case 'assert':
      await assertCondition(p, action, timeout);
      break;

    case 'swipe': {
      const [dx, dy] = swipeVector(action.direction);
      if (!action.selector) {
        // Swiping the screen scrolls: a finger moving up reveals content further down
        await p.mouse.wheel(-dx * 600, -dy * 600);
        break;
      }
      const locator = resolveLocator(p, action.selector);
      await locator.scrollIntoViewIfNeeded({ timeout });
      const box = await locator.boundingBox({ timeout });
      if (!box) throw new Error(`Can't swipe "${action.selector}": it has no size on screen`);
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await p.mouse.move(cx - dx * box.width * 0.35, cy - dy * box.height * 0.35);
      await p.mouse.down();
      await p.mouse.move(cx + dx * box.width * 0.35, cy + dy * box.height * 0.35, { steps: 10 });
      await p.mouse.up();
      break;
    }

    case 'waitFor': {
      const locator = resolveLocator(p, action.selector);
      await locator.waitFor({ state: 'visible', timeout });
      break;
    }

    case 'screenshot':
      // Use BrowserView's capturePage instead of Playwright's page.screenshot
      // because the Playwright CDP connection has 0-width viewport
      if (_view?.webContents?.capturePage) {
        await _view.webContents.capturePage();
      }
      break;
  }
}

/** Retries `check` until it passes or the timeout elapses — like Playwright's auto-retrying expect. */
async function expectEventually(check: () => Promise<void>, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      await check();
      return;
    } catch (err) {
      if (Date.now() >= deadline) throw err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

async function assertCondition(p: Page, action: any, timeout: number): Promise<void> {
  const sel: string = action.selector || '';
  const locator = () => resolveLocator(p, sel);
  const fail = (message: string): never => { throw new Error(message); };
  const attempt = { timeout: Math.min(1000, timeout) };

  switch (action.assertionType) {
    case 'visible':
      return locator().waitFor({ state: 'visible', timeout });
    case 'hidden':
      return locator().waitFor({ state: 'hidden', timeout });
    case 'url':
      return expectEventually(async () => {
        const currentUrl = p.url();
        // "/pattern/flags" is a regex; anything else means "URL contains this text"
        const pattern = String(action.expected).match(/^\/(.+)\/([a-z]*)$/);
        const ok = pattern ? new RegExp(pattern[1], pattern[2]).test(currentUrl) : currentUrl.includes(action.expected);
        if (!ok) fail('URL assertion failed: expected "' + action.expected + '" in "' + currentUrl + '"');
      }, timeout);
    case 'text':
      return expectEventually(async () => {
        const text = sel ? await locator().innerText(attempt) : await p.locator('body').innerText();
        if (!text.includes(action.expected)) fail('Text "' + action.expected + '" not found' + (sel ? ' in ' + sel : ' on page'));
      }, timeout);
    case 'value':
      return expectEventually(async () => {
        const val = await locator().inputValue(attempt);
        if (val !== action.expected) fail('Value assertion failed: expected "' + action.expected + '", got "' + val + '"');
      }, timeout);
    case 'attribute':
      return expectEventually(async () => {
        const actual = await locator().getAttribute(action.attribute || '', attempt);
        if (actual !== action.expected) fail(`Attribute ${action.attribute} expected "${action.expected}", got "${actual}"`);
      }, timeout);
    case 'enabled':
      return expectEventually(async () => { if (!(await locator().isEnabled(attempt))) fail('Element is not enabled: ' + sel); }, timeout);
    case 'disabled':
      return expectEventually(async () => { if (!(await locator().isDisabled(attempt))) fail('Element is not disabled: ' + sel); }, timeout);
    case 'checked':
      return expectEventually(async () => { if (!(await locator().isChecked(attempt))) fail('Element is not checked: ' + sel); }, timeout);
    case 'unchecked':
      return expectEventually(async () => { if (await locator().isChecked(attempt)) fail('Element is checked (expected unchecked): ' + sel); }, timeout);
    case 'editable':
      return expectEventually(async () => { if (!(await locator().isEditable(attempt))) fail('Element is not editable: ' + sel); }, timeout);
    case 'count':
      return expectEventually(async () => {
        const count = await locator().count();
        const expected = parseInt(action.expected, 10);
        if (count !== expected) fail('Count assertion failed: expected ' + expected + ', got ' + count);
      }, timeout);
    case 'focused':
      return expectEventually(async () => {
        if (!(await locator().evaluate((el) => document.activeElement === el, undefined, attempt))) fail('Element is not focused: ' + sel);
      }, timeout);
    case 'empty':
      return expectEventually(async () => {
        const text = await locator().textContent(attempt);
        if (text && text.trim().length > 0) fail('Element is not empty, contains: "' + text.trim().substring(0, 50) + '"');
      }, timeout);
    default:
      fail('Unsupported assertion type: ' + action.assertionType);
  }
}

/**
 * Resolve a Playwright-style selector string into a Playwright Locator.
 * Supports: getByText, getByRole, getByLabel, getByTestId, getByPlaceholder, and CSS selectors.
 */
export function resolveLocator(page: Page, selector: string): Locator {
  // A Playwright locator expression (getByRole(…), chains, regex names, .first()/.nth(n)) is
  // replayed call by call; anything else is a CSS / selector-engine string.
  const calls = parseLocatorChain(selector);
  if (!calls) return page.locator(selector);
  let target: Page | Locator = page;
  for (const { method, args } of calls) {
    target = (target as unknown as Record<string, (...a: unknown[]) => Page | Locator>)[method](...args);
  }
  return target as Locator;
}
