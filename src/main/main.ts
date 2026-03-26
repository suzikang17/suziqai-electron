import { app, BrowserWindow, BrowserView, ipcMain, dialog } from 'electron';
import path from 'path';
import { readdir } from 'fs/promises';
import os from 'os';
import { BrowserManager } from './browser-manager';
import { ClaudeSession } from './claude-session';
import { Recorder } from './recorder';
import { Observer } from './observer';
import { TestExporter } from './test-exporter';
import { ProjectConfigManager } from './project-config';
import { registerIpcHandlers } from './ipc-handlers';
import { IPC } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let browserView: BrowserView | null = null;

const browserManager = new BrowserManager();
const claudeSession = new ClaudeSession();
const recorder = new Recorder();
const observer = new Observer();
const testExporter = new TestExporter();
const projectConfig = new ProjectConfigManager();

// Injected into BrowserView to resolve Playwright-style selectors into DOM elements
const FIND_ELEMENT_JS = `
window.__findElement = function findElement(selector) {
  var m;
  // getByText('...')
  m = selector.match(/^getByText\\(['"](.+?)['"]\\)$/);
  if (m) {
    var text = m[1];
    var all = document.querySelectorAll('a, button, span, p, li, h1, h2, h3, h4, h5, h6, label, td, th, div');
    for (var i = 0; i < all.length; i++) {
      if (all[i].textContent && all[i].textContent.trim() === text) return all[i];
    }
    for (var i = 0; i < all.length; i++) {
      if (all[i].textContent && all[i].textContent.trim().includes(text)) return all[i];
    }
    return null;
  }
  // getByRole('role', { name: '...' })
  m = selector.match(/^getByRole\\(['"](.+?)['"](?:,\\s*\\{\\s*name:\\s*['"](.+?)['"]\\s*\\})?\\)$/);
  if (m) {
    var role = m[1];
    var name = m[2];
    var tagMap = { button: 'button,[role=button]', link: 'a,[role=link]', textbox: 'input:not([type=checkbox]):not([type=radio]),textarea,[role=textbox]', heading: 'h1,h2,h3,h4,h5,h6,[role=heading]', checkbox: 'input[type=checkbox],[role=checkbox]', radio: 'input[type=radio],[role=radio]' };
    var tags = tagMap[role] || '[role=' + role + ']';
    var els = document.querySelectorAll(tags);
    for (var i = 0; i < els.length; i++) {
      if (!name) return els[i];
      var t = (els[i].textContent || '').trim();
      var al = els[i].getAttribute('aria-label') || '';
      var v = els[i].value || '';
      if (t.includes(name) || al.includes(name) || v.includes(name)) return els[i];
    }
    return null;
  }
  // getByLabel('...')
  m = selector.match(/^getByLabel\\(['"](.+?)['"]\\)$/);
  if (m) {
    var labelText = m[1];
    var labels = document.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].textContent && labels[i].textContent.trim().includes(labelText)) {
        if (labels[i].htmlFor) return document.getElementById(labels[i].htmlFor);
        var inp = labels[i].querySelector('input, select, textarea');
        if (inp) return inp;
      }
    }
    var ariaEls = document.querySelectorAll('[aria-label*="' + labelText + '"]');
    if (ariaEls.length) return ariaEls[0];
    var phEls = document.querySelectorAll('[placeholder*="' + labelText + '"]');
    if (phEls.length) return phEls[0];
    return null;
  }
  // getByTestId('...')
  m = selector.match(/^getByTestId\\(['"](.+?)['"]\\)$/);
  if (m) return document.querySelector('[data-testid="' + m[1] + '"]');
  // getByPlaceholder('...')
  m = selector.match(/^getByPlaceholder\\(['"](.+?)['"]\\)$/);
  if (m) return document.querySelector('[placeholder="' + m[1] + '"]') || document.querySelector('[placeholder*="' + m[1] + '"]');
  // CSS selector fallback
  return document.querySelector(selector);
}
`;

async function executeActionOnView(view: BrowserView, action: any): Promise<void> {
  const wc = view.webContents;
  const sel = (action.selector || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`');

  // Ensure findElement is available
  if (action.type !== 'navigate' && action.type !== 'screenshot') {
    await wc.executeJavaScript(`
      if (!window.__findElement) { ${FIND_ELEMENT_JS} }
      true;
    `).catch(() => {});
  }

  switch (action.type) {
    case 'navigate':
      await wc.loadURL(action.url.startsWith('http') ? action.url : `http://${action.url}`);
      break;
    case 'click':
      await wc.executeJavaScript(`
        (function() {
          var el = window.__findElement(\`${sel}\`);
          if (!el) throw new Error('Element not found: ${sel}');
          el.scrollIntoView({ block: 'center' });
          el.click();
        })()
      `);
      break;
    case 'fill': {
      const val = (action.value || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`');
      await wc.executeJavaScript(`
        (function() {
          var el = window.__findElement(\`${sel}\`);
          if (!el) throw new Error('Element not found: ${sel}');
          el.focus();
          el.value = \`${val}\`;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        })()
      `);
      break;
    }
    case 'assert':
      if (action.assertionType === 'url') {
        const currentUrl = wc.getURL();
        if (!currentUrl.includes(action.expected)) {
          throw new Error(`URL assertion failed: expected "${action.expected}" in "${currentUrl}"`);
        }
      } else if (action.assertionType === 'visible') {
        // Poll for element visibility (page might still be loading)
        const visible = await wc.executeJavaScript(`
          new Promise(function(resolve) {
            var findEl = window.__findElement;
            var attempts = 0;
            function check() {
              var el = findEl(\`${sel}\`);
              if (el) {
                resolve(true);
              } else if (attempts++ > 30) {
                resolve(false);
              } else {
                setTimeout(check, 100);
              }
            }
            check();
          })
        `);
        if (!visible) throw new Error(`Element not visible: ${action.selector}`);
      } else if (action.assertionType === 'text') {
        const text = await wc.executeJavaScript(`document.body.innerText`);
        if (!text.includes(action.expected)) {
          throw new Error(`Text "${action.expected}" not found on page`);
        }
      }
      break;
    case 'waitFor':
      await wc.executeJavaScript(`
        new Promise(function(resolve, reject) {
          var findEl = window.__findElement || function(s) { return document.querySelector(s); };
          var attempts = 0;
          function check() {
            if (findEl(\`${sel}\`)) {
              resolve(true);
            } else if (attempts++ > 50) {
              reject(new Error('Timeout waiting for: ${sel}'));
            } else {
              setTimeout(check, 100);
            }
          }
          check();
        })
      `);
      break;
    case 'screenshot':
      break;
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'suziQai',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Viewport bounds — register early before renderer loads
  ipcMain.handle('browser:viewport-bounds', (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    if (browserView) {
      browserView.setBounds({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      });
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  // Register IPC handlers
  registerIpcHandlers({
    browserManager,
    claudeSession,
    recorder,
    observer,
    testExporter,
    getWindow: () => mainWindow,
  });

  // Project open handler
  ipcMain.handle(IPC.PROJECT_OPEN, async (_event, projectPath: string, baseUrl?: string) => {
    const config = await projectConfig.load(projectPath);
    if (baseUrl) {
      config.baseUrl = baseUrl;
      await projectConfig.update({ baseUrl });
    }

    // Remove any existing BrowserView
    if (browserView && mainWindow) {
      mainWindow.removeBrowserView(browserView);
      browserView = null;
    }

    // Create BrowserView for the target app
    browserView = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    mainWindow!.addBrowserView(browserView);

    // Navigate to the base URL
    const url = config.baseUrl.startsWith('http') ? config.baseUrl : `http://${config.baseUrl}`;
    browserView.webContents.loadURL(url);

    // Inject findElement helper into every page load
    browserView.webContents.on('did-finish-load', () => {
      browserView?.webContents.executeJavaScript(FIND_ELEMENT_JS).catch(() => {});
    });

    // Sync URL bar when BrowserView navigates
    browserView.webContents.on('did-navigate', (_event, url) => {
      if (mainWindow) {
        mainWindow.webContents.send(IPC.BROWSER_URL_CHANGED, url);
      }
    });

    browserView.webContents.on('did-navigate-in-page', (_event, url) => {
      if (mainWindow) {
        mainWindow.webContents.send(IPC.BROWSER_URL_CHANGED, url);
      }
    });

    if (mainWindow) {
      mainWindow.webContents.send(IPC.PROJECT_CONFIG, config);
    }
  });

  // Dialog handlers

  // Override browser navigation to use BrowserView
  ipcMain.removeHandler(IPC.BROWSER_NAVIGATE);
  ipcMain.handle(IPC.BROWSER_NAVIGATE, async (_event, url: string) => {
    if (browserView) {
      const fullUrl = url.startsWith('http') ? url : `http://${url}`;
      await browserView.webContents.loadURL(fullUrl);
      if (mainWindow) {
        mainWindow.webContents.send(IPC.BROWSER_URL_CHANGED, browserView.webContents.getURL());
      }
    }
  });

  // Override chat handler to use BrowserView context
  ipcMain.removeHandler(IPC.CHAT_SEND);
  ipcMain.handle(IPC.CHAT_SEND, async (_event, message: string) => {
    const win = mainWindow;
    if (!win) return;

    let context = {
      url: '',
      accessibilityTree: '{}',
      screenshot: '',
    };

    if (browserView) {
      context.url = browserView.webContents.getURL();
      try {
        const title = await browserView.webContents.executeJavaScript('document.title');
        const bodyText = await browserView.webContents.executeJavaScript(
          `document.body.innerText.substring(0, 2000)`
        );
        context.accessibilityTree = JSON.stringify({ title, bodyText });
      } catch {}
    }

    try {
      const response = await claudeSession.send(message, context);
      win.webContents.send(IPC.CHAT_RESPONSE, response.message);

      if (response.steps && response.steps.length > 0) {
        const steps = response.steps.map((s: any, i: number) => ({
          id: `step-${Date.now()}-${i}`,
          label: s.label,
          action: s.action,
          status: 'pending' as const,
        }));
        win.webContents.send(IPC.STEPS_PROPOSED, steps);
      }
    } catch (err) {
      win.webContents.send(IPC.CHAT_RESPONSE, `Error: ${(err as Error).message}`);
    }
  });

  // Override step execution to use BrowserView
  ipcMain.removeHandler(IPC.STEP_EXECUTE);
  ipcMain.handle(IPC.STEP_EXECUTE, async (_event, stepId: string, action: any) => {
    const win = mainWindow;
    if (!win || !browserView) return;

    win.webContents.send(IPC.STEP_RESULT, stepId, 'running');

    try {
      await executeActionOnView(browserView, action);
      win.webContents.send(IPC.STEP_RESULT, stepId, 'passed');
      win.webContents.send(IPC.BROWSER_URL_CHANGED, browserView.webContents.getURL());
    } catch (err) {
      win.webContents.send(IPC.STEP_RESULT, stepId, 'failed', (err as Error).message);
    }
  });

  ipcMain.removeHandler(IPC.STEP_EXECUTE_ALL);
  ipcMain.handle(IPC.STEP_EXECUTE_ALL, async (_event, steps: Array<{ id: string; action: any }>) => {
    const win = mainWindow;
    if (!win || !browserView) return;

    for (const step of steps) {
      win.webContents.send(IPC.STEP_RESULT, step.id, 'running');
      try {
        await executeActionOnView(browserView, step.action);
        win.webContents.send(IPC.STEP_RESULT, step.id, 'passed');
      } catch (err) {
        win.webContents.send(IPC.STEP_RESULT, step.id, 'failed', (err as Error).message);
        break;
      }
    }
    win.webContents.send(IPC.BROWSER_URL_CHANGED, browserView.webContents.getURL());
  });

  // Dialog handlers
  ipcMain.handle('dialog:open', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Open Project',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:save', async (_event, defaultPath: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [{ name: 'TypeScript', extensions: ['ts'] }],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('fs:read-dir', async (_event, dirPath: string) => {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.')) // hide dotfiles
      .sort((a, b) => {
        // directories first, then alphabetical
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map(e => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory(),
      }));
  });

  ipcMain.handle('fs:home-path', () => {
    return os.homedir();
  });

  // Last project persistence
  const lastProjectFile = path.join(os.homedir(), '.suziqai-last-project');

  ipcMain.handle('project:get-last', async () => {
    try {
      const { readFile } = await import('fs/promises');
      return (await readFile(lastProjectFile, 'utf-8')).trim();
    } catch {
      return null;
    }
  });

  ipcMain.handle('project:set-last', async (_event, projectPath: string) => {
    const { writeFile } = await import('fs/promises');
    await writeFile(lastProjectFile, projectPath, 'utf-8');
  });

  mainWindow.on('closed', async () => {
    await browserManager.close();
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
