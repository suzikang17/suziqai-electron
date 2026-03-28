import { app, BrowserWindow, BrowserView, ipcMain, dialog } from 'electron';
import path from 'path';
import { readdir } from 'fs/promises';
import os from 'os';
import { ClaudeSession } from './claude-session';
import { Recorder } from './recorder';
import { Observer } from './observer';
import { TestExporter } from './test-exporter';
import { ProjectConfigManager } from './project-config';
import { TestLibrary } from './test-library';
import { registerIpcHandlers } from './ipc-handlers';
import { IPC } from '../shared/types';
// Lazy-loaded to avoid importing playwright at startup
async function executeActionOnView(view: any, action: any): Promise<void> {
  const { executeActionOnView: exec } = await import('./browser-actions');
  return exec(view, action);
}

let mainWindow: BrowserWindow | null = null;
let browserView: BrowserView | null = null;

const claudeSession = new ClaudeSession();
const recorder = new Recorder();
const observer = new Observer();
const testExporter = new TestExporter();
const projectConfig = new ProjectConfigManager();
let testLibrary: TestLibrary = new TestLibrary('');

let ipcRegistered = false;
function registerAllIpcHandlers(): void {
  // Viewport bounds
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

  // Filesystem
  ipcMain.handle('fs:read-dir', async (_event, dirPath: string) => {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.'))
      .sort((a, b) => {
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

  ipcMain.handle('fs:home-path', () => os.homedir());

  const lastProjectFile = path.join(os.homedir(), '.suziqai-last-project');

  ipcMain.handle('project:get-last', async () => {
    try {
      const { readFile } = await import('fs/promises');
      return (await readFile(lastProjectFile, 'utf-8')).trim();
    } catch { return null; }
  });

  ipcMain.handle('project:set-last', async (_event, projectPath: string) => {
    const { writeFile } = await import('fs/promises');
    await writeFile(lastProjectFile, projectPath, 'utf-8');
  });

  ipcMain.handle('session:save', async (_event, data: any) => {
    const pp = projectConfig.getProjectPath();
    if (!pp) return;
    const { writeFile, mkdir } = await import('fs/promises');
    await mkdir(path.join(pp, '.suziqai'), { recursive: true });
    await writeFile(path.join(pp, '.suziqai', 'session.json'), JSON.stringify(data, null, 2), 'utf-8');
  });

  ipcMain.handle('session:load', async () => {
    const pp = projectConfig.getProjectPath();
    if (!pp) return null;
    try {
      const { readFile } = await import('fs/promises');
      return JSON.parse(await readFile(path.join(pp, '.suziqai', 'session.json'), 'utf-8'));
    } catch { return null; }
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

  ipcMain.handle('picker:start', async () => {
    if (!browserView || !mainWindow) return;
    const { startPicker } = await import('./element-picker');
    await startPicker(browserView, mainWindow);
  });

  ipcMain.handle('picker:stop', async () => {
    if (!browserView) return;
    const { stopPicker } = await import('./element-picker');
    await stopPicker(browserView);
  });

  ipcMain.handle('clipboard:copy', async (_event, text: string) => {
    const { clipboard } = await import('electron');
    clipboard.writeText(text);
  });
}

function createWindow(): void {
  registerAllIpcHandlers();

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

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  // Register IPC handlers (only once — survives macOS dock reactivation)
  if (!ipcRegistered) {
    ipcRegistered = true;

    registerIpcHandlers({
      browserManager: null as any, // Not used — BrowserView overrides handle all browser actions
      claudeSession,
      recorder,
      observer,
      testExporter,
      getTestLibrary: () => testLibrary,
      getWindow: () => mainWindow,
    });
  }

  // Project open handler
  ipcMain.removeHandler(IPC.PROJECT_OPEN);
  ipcMain.handle(IPC.PROJECT_OPEN, async (_event, projectPath: string, baseUrl?: string) => {
    const config = await projectConfig.load(projectPath);
    if (baseUrl) {
      config.baseUrl = baseUrl;
      await projectConfig.update({ baseUrl });
    }

    // Re-create TestLibrary with the resolved testOutputDir for this project
    testLibrary = new TestLibrary(path.join(projectPath, config.testOutputDir || 'tests'));

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

    // Set initial bounds — will be refined by renderer's ResizeObserver
    const winBounds = mainWindow!.getContentBounds();
    const sidebarWidth = 300;
    const toolbarHeight = 40;
    const chatHeight = 220;
    browserView.setBounds({
      x: sidebarWidth,
      y: toolbarHeight,
      width: Math.max(100, winBounds.width - sidebarWidth),
      height: Math.max(100, winBounds.height - toolbarHeight - chatHeight),
    });

    // Navigate to the base URL
    const url = config.baseUrl.startsWith('http') ? config.baseUrl : `http://${config.baseUrl}`;
    browserView.webContents.loadURL(url);


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

  // Browser back/forward
  ipcMain.removeHandler('browser:go-back');
  ipcMain.handle('browser:go-back', async () => {
    if (browserView && browserView.webContents.canGoBack()) {
      browserView.webContents.goBack();
      setTimeout(() => {
        if (mainWindow && browserView) {
          mainWindow.webContents.send(IPC.BROWSER_URL_CHANGED, browserView.webContents.getURL());
        }
      }, 500);
    }
  });

  ipcMain.removeHandler('browser:go-forward');
  ipcMain.handle('browser:go-forward', async () => {
    if (browserView && browserView.webContents.canGoForward()) {
      browserView.webContents.goForward();
      setTimeout(() => {
        if (mainWindow && browserView) {
          mainWindow.webContents.send(IPC.BROWSER_URL_CHANGED, browserView.webContents.getURL());
        }
      }, 500);
    }
  });

  // Helper: capture screenshot from BrowserView as Buffer
  async function captureBrowserViewScreenshot(): Promise<Buffer> {
    if (!browserView) return Buffer.alloc(0);
    try {
      const image = await browserView.webContents.capturePage();
      return image.toPNG();
    } catch {
      return Buffer.alloc(0);
    }
  }

  // Helper: get accessibility tree from BrowserView
  async function getAccessibilityContext(): Promise<string> {
    if (!browserView) return '{}';
    try {
      const { connectToElectron } = await import('./browser-actions');
      const page = await connectToElectron();
      const ariaSnapshot = await page.locator('body').ariaSnapshot();
      return ariaSnapshot.substring(0, 8000);
    } catch {
      try {
        const title = await browserView.webContents.executeJavaScript('document.title');
        const bodyText = await browserView.webContents.executeJavaScript(
          'document.body.innerText.substring(0, 3000)'
        );
        return JSON.stringify({ title, bodyText });
      } catch {
        return '{}';
      }
    }
  }

  // Override chat handler to use BrowserView context with screenshot
  ipcMain.removeHandler(IPC.CHAT_SEND);
  ipcMain.handle(IPC.CHAT_SEND, async (_event, message: string) => {
    const win = mainWindow;
    if (!win) return;

    const context = {
      url: browserView ? browserView.webContents.getURL() : '',
      accessibilityTree: await getAccessibilityContext(),
      screenshot: await captureBrowserViewScreenshot(),
    };

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

  // Override step execution to use BrowserView with visual QA
  ipcMain.removeHandler(IPC.STEP_EXECUTE);
  ipcMain.handle(IPC.STEP_EXECUTE, async (_event, stepId: string, action: any) => {
    const win = mainWindow;
    if (!win || !browserView) return;

    win.webContents.send(IPC.STEP_RESULT, stepId, 'running');

    try {
      const beforeScreenshot = await captureBrowserViewScreenshot();

      await executeActionOnView(browserView, action);
      win.webContents.send(IPC.STEP_RESULT, stepId, 'passed');
      win.webContents.send(IPC.BROWSER_URL_CHANGED, browserView.webContents.getURL());

      // Wait for DOM to settle, capture after screenshot
      await new Promise(r => setTimeout(r, 500));
      const afterScreenshot = await captureBrowserViewScreenshot();

      claudeSession.addSnapshot(afterScreenshot, browserView.webContents.getURL(), stepId);

      // Run visual QA asynchronously
      const stepLabel = `${action.type}${action.type === 'navigate' ? ` ${action.url}` : ''}`;
      claudeSession.requestVisualQA(beforeScreenshot, afterScreenshot, stepLabel).then((qaResponse) => {
        if (win.isDestroyed()) return;
        if (qaResponse.message) {
          win.webContents.send(IPC.CHAT_RESPONSE, qaResponse.message);
        }
        if (qaResponse.steps.length > 0) {
          const steps = qaResponse.steps.map((s: any, i: number) => ({
            id: `qa-${Date.now()}-${i}`,
            label: s.label,
            action: s.action,
            status: 'pending' as const,
            _fromVisualQA: true,
          }));
          win.webContents.send(IPC.STEPS_PROPOSED, steps);
        }
      }).catch((err) => {
        console.error('Visual QA failed:', err);
      });
    } catch (err) {
      win.webContents.send(IPC.STEP_RESULT, stepId, 'failed', (err as Error).message);
    }
  });

  ipcMain.removeHandler(IPC.STEP_EXECUTE_ALL);
  ipcMain.handle(IPC.STEP_EXECUTE_ALL, async (_event, steps: Array<{ id: string; action: any }>) => {
    const win = mainWindow;
    if (!win || !browserView) return;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      win.webContents.send(IPC.STEP_RESULT, step.id, 'running');

      try {
        const beforeScreenshot = await captureBrowserViewScreenshot();

        await executeActionOnView(browserView, step.action);
        win.webContents.send(IPC.STEP_RESULT, step.id, 'passed');

        await new Promise(r => setTimeout(r, 500));
        const afterScreenshot = await captureBrowserViewScreenshot();
        claudeSession.addSnapshot(afterScreenshot, browserView.webContents.getURL(), step.id);

        // Visual QA every 3rd step and on the final step
        const isThirdStep = (i + 1) % 3 === 0;
        const isFinalStep = i === steps.length - 1;

        if (isThirdStep || isFinalStep) {
          const stepLabel = `${step.action.type}${step.action.type === 'navigate' ? ` ${step.action.url}` : ''}`;
          try {
            const qaResponse = await claudeSession.requestVisualQA(beforeScreenshot, afterScreenshot, stepLabel);
            if (qaResponse.message) {
              win.webContents.send(IPC.CHAT_RESPONSE, qaResponse.message);
            }
            if (qaResponse.steps.length > 0) {
              const qaSteps = qaResponse.steps.map((s: any, j: number) => ({
                id: `qa-${Date.now()}-${j}`,
                label: s.label,
                action: s.action,
                status: 'pending' as const,
                _fromVisualQA: true,
              }));
              win.webContents.send(IPC.STEPS_PROPOSED, qaSteps);
            }
          } catch (err) {
            console.error('Visual QA failed during Run All:', err);
          }
        }
      } catch (err) {
        win.webContents.send(IPC.STEP_RESULT, step.id, 'failed', (err as Error).message);
        break;
      }
    }
    win.webContents.send(IPC.BROWSER_URL_CHANGED, browserView.webContents.getURL());
  });

  mainWindow.on('closed', async () => {
    const { disconnectPlaywright } = await import('./browser-actions');
    await disconnectPlaywright();
    mainWindow = null;
  });
}

// CDP port for Playwright connection — configurable via SUZIQAI_CDP_PORT env var
export const CDP_PORT = parseInt(process.env.SUZIQAI_CDP_PORT || '9222', 10);

app.commandLine.appendSwitch('remote-debugging-port', String(CDP_PORT));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
