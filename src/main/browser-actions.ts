import type { Browser, Page } from 'playwright';

const CDP_PORT = parseInt(process.env.SUZIQAI_CDP_PORT || '9222', 10);

let browser: Browser | null = null;
let connectPromise: Promise<Page> | null = null;

async function getChromium() {
  const pw = await import('playwright');
  return pw.chromium;
}

function findTargetPage(b: Browser): Page | null {
  const allPages: Page[] = [];
  for (const ctx of b.contexts()) {
    for (const p of ctx.pages()) {
      allPages.push(p);
    }
  }

  for (const p of allPages) {
    const url = p.url();
    if (
      !url.includes('localhost:5173') &&
      !url.startsWith('file://') &&
      !url.startsWith('devtools://') &&
      !url.startsWith('chrome://') &&
      url !== 'about:blank'
    ) {
      return p;
    }
  }

  return allPages[allPages.length - 1] ?? null;
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
  if (browser && browser.isConnected() && cachedPage && !cachedPage.isClosed()) {
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
  const p = await connectToElectron();

  switch (action.type) {
    case 'navigate': {
      const url = action.url.startsWith('http') ? action.url : 'http://' + action.url;
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
      await locator.fill(action.value || '', { timeout });
      break;
    }

    case 'assert':
      if (action.assertionType === 'url') {
        const currentUrl = p.url();
        if (!currentUrl.includes(action.expected)) {
          throw new Error('URL assertion failed: expected "' + action.expected + '" in "' + currentUrl + '"');
        }
      } else if (action.assertionType === 'visible') {
        const locator = resolveLocator(p, action.selector || '');
        await locator.waitFor({ state: 'visible', timeout });
      } else if (action.assertionType === 'text') {
        const bodyText = await p.locator('body').innerText();
        if (!bodyText.includes(action.expected)) {
          throw new Error('Text "' + action.expected + '" not found on page');
        }
      } else if (action.assertionType === 'hidden') {
        const locator = resolveLocator(p, action.selector || '');
        await locator.waitFor({ state: 'hidden', timeout });
      } else if (action.assertionType === 'value') {
        const locator = resolveLocator(p, action.selector || '');
        const val = await locator.inputValue();
        if (val !== action.expected) {
          throw new Error('Value assertion failed: expected "' + action.expected + '", got "' + val + '"');
        }
      }
      break;

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

/**
 * Resolve a Playwright-style selector string into a Playwright Locator.
 * Supports: getByText, getByRole, getByLabel, getByTestId, getByPlaceholder, and CSS selectors.
 */
function resolveLocator(page: Page, selector: string) {
  let m: RegExpMatchArray | null;

  // getByText('...')
  m = selector.match(/^getByText\(['"](.+?)['"]\)$/);
  if (m) return page.getByText(m[1]);

  // getByRole('role', { name: '...' })
  m = selector.match(/^getByRole\(['"](.+?)['"](?:,\s*\{\s*name:\s*['"](.+?)['"]\s*\})?\)$/);
  if (m) {
    const role = m[1] as Parameters<Page['getByRole']>[0];
    return m[2] ? page.getByRole(role, { name: m[2] }) : page.getByRole(role);
  }

  // getByLabel('...')
  m = selector.match(/^getByLabel\(['"](.+?)['"]\)$/);
  if (m) return page.getByLabel(m[1]);

  // getByTestId('...')
  m = selector.match(/^getByTestId\(['"](.+?)['"]\)$/);
  if (m) return page.getByTestId(m[1]);

  // getByPlaceholder('...')
  m = selector.match(/^getByPlaceholder\(['"](.+?)['"]\)$/);
  if (m) return page.getByPlaceholder(m[1]);

  // CSS selector fallback
  return page.locator(selector);
}
