import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import type { StepAction } from '../shared/types';

type BrowserType = 'chromium' | 'firefox' | 'webkit';

const launchers = { chromium, firefox, webkit };

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launch(browserType: BrowserType): Promise<void> {
    const launcher = launchers[browserType];
    this.browser = await launcher.launch({ headless: true });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.goto(url);
  }

  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.click(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.fill(selector, value);
  }

  async waitFor(selector: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.waitForSelector(selector);
  }

  async screenshot(): Promise<Buffer> {
    if (!this.page) throw new Error('Browser not launched');
    return await this.page.screenshot();
  }

  async evaluate(expression: string): Promise<unknown> {
    if (!this.page) throw new Error('Browser not launched');
    return await this.page.evaluate(expression);
  }

  async getAccessibilityTree(): Promise<string> {
    if (!this.page) throw new Error('Browser not launched');
    return await this.page.locator(':root').ariaSnapshot();
  }

  getCurrentUrl(): string {
    if (!this.page) throw new Error('Browser not launched');
    return this.page.url();
  }

  getPage(): Page | null {
    return this.page;
  }

  getCdpSession() {
    if (!this.page) throw new Error('Browser not launched');
    return this.context!.newCDPSession(this.page);
  }

  async executeAction(action: StepAction): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    switch (action.type) {
      case 'navigate':
        await this.page.goto(action.url);
        break;
      case 'click':
        await this.page.click(action.selector);
        break;
      case 'fill':
        await this.page.fill(action.selector, action.value);
        break;
      case 'waitFor':
        await this.page.waitForSelector(action.selector);
        break;
      case 'screenshot':
        await this.page.screenshot();
        break;
      case 'assert':
        await this.executeAssertion(action);
        break;
    }
  }

  private async executeAssertion(action: Extract<StepAction, { type: 'assert' }>): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    const { assertionType, expected, selector } = action;

    switch (assertionType) {
      case 'url':
        if (this.page.url() !== expected) {
          throw new Error(`Expected URL "${expected}", got "${this.page.url()}"`);
        }
        break;
      case 'visible':
        await this.page.waitForSelector(selector!, { state: 'visible', timeout: 5000 });
        break;
      case 'text': {
        const text = await this.page.textContent(selector!);
        if (!text?.includes(expected)) {
          throw new Error(`Expected text "${expected}" in "${selector}", got "${text}"`);
        }
        break;
      }
      case 'hidden':
        await this.page.waitForSelector(selector!, { state: 'hidden', timeout: 5000 });
        break;
      case 'value': {
        const value = await this.page.inputValue(selector!);
        if (value !== expected) {
          throw new Error(`Expected value "${expected}" in "${selector}", got "${value}"`);
        }
        break;
      }
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}
