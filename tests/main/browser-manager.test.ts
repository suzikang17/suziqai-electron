import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserManager } from '../../src/main/browser-manager';

describe('BrowserManager', () => {
  let manager: BrowserManager;

  beforeEach(() => {
    manager = new BrowserManager();
  });

  afterEach(async () => {
    await manager.close();
  });

  it('launches a browser and navigates to a URL', async () => {
    await manager.launch('chromium');
    await manager.navigate('data:text/html,<h1>Hello</h1>');
    const url = manager.getCurrentUrl();
    expect(url).toContain('data:text/html');
  });

  it('executes a click action', async () => {
    await manager.launch('chromium');
    await manager.navigate('data:text/html,<button id="btn">Click me</button>');
    await manager.click('button#btn');
  });

  it('executes a fill action', async () => {
    await manager.launch('chromium');
    await manager.navigate('data:text/html,<input id="name" />');
    await manager.fill('input#name', 'test value');
    const value = await manager.evaluate('document.querySelector("#name").value');
    expect(value).toBe('test value');
  });

  it('returns an accessibility tree snapshot', async () => {
    await manager.launch('chromium');
    await manager.navigate('data:text/html,<h1>Title</h1><button>Click</button>');
    const snapshot = await manager.getAccessibilityTree();
    expect(snapshot).toContain('Title');
    expect(snapshot).toContain('Click');
  });
});
