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
import { executeActionOnView, disconnectPlaywright, connectToElectron, setExpectedUrlProvider, resolveLocator } from './browser-actions';
import { generateSelectors } from './element-picker';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { runJevShadow } from './jev-shadow';
import { IosMode, IOS_CHAT_PREFIX } from './ios-mode';
import { applyReadOnlyGuard } from './read-only-guard';

const TARGET_PARTITION = 'persist:suziqai-target';
// Supabase password login + token refresh; projects add their own verified read-only endpoints
const DEFAULT_READ_ONLY_ALLOW = '/auth/v1/token\\?grant_type=(password|refresh_token)';
import type { IosProjectSettings } from '../shared/types';

// Local secrets (e.g. TYPESAFE_API_KEY) — gitignored, optional
try {
  process.loadEnvFile(path.join(app.getAppPath(), '.env.local'));
} catch {
  // no .env.local
}

// Jev shadow spike: compares Jev's element picks against Claude's when a key is set
setExpectedUrlProvider(() => browserView?.webContents.getURL() || undefined);

const jevClient = process.env.TYPESAFE_API_KEY ? new TypeSafeClient({ defaultModel: 'jev-1.13.0' }) : null;

// iOS projects drive a simulator instead of the BrowserView
const iosMode = new IosMode(app.getAppPath(), () => mainWindow, jevClient);

let mainWindow: BrowserWindow | null = null;
let browserView: BrowserView | null = null;
let autopilotEnabled = false;

const claudeSession = new ClaudeSession();
// Records the target-app BrowserView; each event becomes a step in the sidebar as it happens
const recorder = new Recorder({
  async chooseSelector(info, recId) {
    // Role selectors without a name ("getByRole('textbox')") say little; try them last
    const candidates = generateSelectors(info)
      .map((c) => c.selector)
      .sort((a, b) => Number(/^getByRole\('[^']+'\)$/.test(a)) - Number(/^getByRole\('[^']+'\)$/.test(b)));
    try {
      const page = await connectToElectron();
      const counts = await Promise.all(candidates.map((s) => resolveLocator(page, s).count().catch(() => 0)));
      const unique = candidates.find((_, i) => counts[i] === 1);
      if (unique) return unique;
      // Several matches: pin the one that was actually used, via the tag the recorder put on it
      for (const [i, selector] of candidates.entries()) {
        if (counts[i] < 2 || !recId) continue;
        const index = await resolveLocator(page, selector)
          .evaluateAll((els, id) => els.findIndex((el) => el.getAttribute('data-suziqai-rec') === id), recId)
          .catch(() => -1);
        if (index >= 0) return `${selector}.nth(${index})`;
      }
    } catch {
      // page gone (navigation) — fall back to the best-ranked candidate
    }
    return candidates[0];
  },
  onStep(step) {
    mainWindow?.webContents.send(IPC.STEPS_PROPOSED, [
      { id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...step, status: 'pending' },
    ]);
  },
});
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
    // Automation runs set this so the app doesn't reopen a real project on launch
    if (process.env.SUZIQAI_NO_RESTORE) return null;
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
      observer,
      testExporter,
      getTestLibrary: () => testLibrary,
      getWindow: () => mainWindow,
      resolverDeps: {
        getPage: connectToElectron,
        executeAction: (action) => executeActionOnView(browserView, action),
        jev: jevClient,
      },
    });
  }

  // Element highlighting
  ipcMain.removeHandler('element:highlight');
  ipcMain.handle('element:highlight', async (_event, selector: string) => {
    if (!browserView) return;
    try {
      const s = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      await browserView.webContents.executeJavaScript(`
        (function() {
          document.querySelectorAll('[data-suziqai-highlight]').forEach(el => el.remove());
          var sel = '${s}';
          var el = null;
          try {
            var m = sel.match(/^getByRole\\(['"](.+?)['"](?:,\\s*\\{\\s*name:\\s*['"](.+?)['"]\\s*\\})?\\)$/);
            if (m) { var candidates = document.querySelectorAll('[role="'+m[1]+'"],'+m[1]); for (var i=0;i<candidates.length;i++) { if (!m[2] || candidates[i].textContent.trim().includes(m[2]) || (candidates[i].getAttribute('aria-label')||'').includes(m[2])) { el = candidates[i]; break; } } }
            if (!el) { m = sel.match(/^getByText\\(['"](.+?)['"]\\)$/); if (m) { var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while(tw.nextNode()) { if (tw.currentNode.textContent.includes(m[1])) { el = tw.currentNode.parentElement; break; } } } }
            if (!el) { m = sel.match(/^getByLabel\\(['"](.+?)['"]\\)$/); if (m) { var labels = document.querySelectorAll('label'); for (var i=0;i<labels.length;i++) { if (labels[i].textContent.includes(m[1])) { el = labels[i].control || labels[i].querySelector('input,select,textarea'); break; } } } }
            if (!el) { m = sel.match(/^getByTestId\\(['"](.+?)['"]\\)$/); if (m) { el = document.querySelector('[data-testid="'+m[1]+'"]'); } }
            if (!el) { m = sel.match(/^getByPlaceholder\\(['"](.+?)['"]\\)$/); if (m) { el = document.querySelector('[placeholder="'+m[1]+'"]'); } }
            if (!el) { el = document.querySelector(sel); }
          } catch(e) {}
          if (el) {
            var rect = el.getBoundingClientRect();
            var overlay = document.createElement('div');
            overlay.setAttribute('data-suziqai-highlight', 'true');
            overlay.style.cssText = 'position:fixed;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+'px;border:2px solid #0969da;background:rgba(9,105,218,0.15);border-radius:3px;z-index:99999;pointer-events:none;transition:all 0.2s ease;';
            document.body.appendChild(overlay);
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        })()
      `);
    } catch (err) {
      console.error('[suziQai] Highlight failed:', err);
    }
  });

  ipcMain.removeHandler('element:clear-highlight');
  ipcMain.handle('element:clear-highlight', async () => {
    if (!browserView) return;
    try {
      await browserView.webContents.executeJavaScript(`
        document.querySelectorAll('[data-suziqai-highlight]').forEach(el => el.remove());
      `);
    } catch {}
  });

  // Project open handler
  ipcMain.removeHandler(IPC.PROJECT_OPEN);
  ipcMain.handle(IPC.PROJECT_OPEN, async (_event, projectPath: string, baseUrl?: string, ios?: IosProjectSettings, readOnly?: boolean) => {
    let config = await projectConfig.load(projectPath);
    if (ios) {
      config = await projectConfig.update({ platform: 'ios', ios });
    } else if (baseUrl) {
      config = await projectConfig.update({ platform: 'web', baseUrl });
    }
    if (readOnly === true && !config.readOnly) {
      config = await projectConfig.update({ readOnly: { allow: [DEFAULT_READ_ONLY_ALLOW] } });
    } else if (readOnly === false && config.readOnly) {
      config = await projectConfig.update({ readOnly: undefined });
    }

    // Re-create TestLibrary with the resolved testOutputDir for this project
    const testDir = path.join(projectPath, config.testOutputDir || 'tests');
    testLibrary = new TestLibrary(testDir, config.platform === 'ios' ? config.ios : undefined);

    // Remove any existing BrowserView
    if (browserView && mainWindow) {
      mainWindow.removeBrowserView(browserView);
      // Destroy it too, or its page lingers as a CDP target that actions can land on
      browserView.webContents.close();
      browserView = null;
      await disconnectPlaywright();
    }

    if (config.platform === 'ios' && config.ios) {
      const udid = await iosMode.open(config.ios);
      if (udid !== config.ios.udid) config = await projectConfig.update({ ios: { ...config.ios, udid } });
      mainWindow?.webContents.send(IPC.PROJECT_CONFIG, config);
      return config;
    }
    await iosMode.close();

    // Create BrowserView for the target app
    browserView = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        // Own session, so read-only mode filters only the target app (not suziQai's UI)
        partition: TARGET_PARTITION,
      },
    });
    applyReadOnlyGuard(browserView.webContents.session, config.readOnly?.allow ?? null, (method, url) => {
      mainWindow?.webContents.send(IPC.CHAT_RESPONSE, `🛡 Read-only mode blocked ${method} ${url}`);
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
    return config;
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

  // Autopilot toggle
  ipcMain.removeHandler('autopilot:toggle');
  ipcMain.handle('autopilot:toggle', (_event, enabled: boolean) => {
    autopilotEnabled = enabled;
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

  // Recording: capture the target app's BrowserView directly (web projects)
  ipcMain.removeHandler(IPC.RECORD_START);
  ipcMain.handle(IPC.RECORD_START, async () => {
    if (browserView) await recorder.start(browserView.webContents);
  });
  ipcMain.removeHandler(IPC.RECORD_STOP);
  ipcMain.handle(IPC.RECORD_STOP, async () => {
    recorder.stop();
  });

  // Override chat handler to use BrowserView context with screenshot
  ipcMain.removeHandler(IPC.CHAT_SEND);
  ipcMain.handle(IPC.CHAT_SEND, async (_event, message: string) => {
    const win = mainWindow;
    if (!win) return;

    const context = iosMode.active
      ? await iosMode.chatContext()
      : {
          url: browserView ? browserView.webContents.getURL() : '',
          accessibilityTree: await getAccessibilityContext(),
          screenshot: await captureBrowserViewScreenshot(),
        };

    try {
      const response = await claudeSession.send(iosMode.active ? `${IOS_CHAT_PREFIX}\n${message}` : message, context);
      win.webContents.send(IPC.CHAT_RESPONSE, response.message);

      if (jevClient && !iosMode.active && response.steps.length > 0) {
        connectToElectron()
          .then((page) =>
            runJevShadow({
              page,
              client: jevClient,
              logPath: path.join(app.getPath('userData'), 'jev-spike.jsonl'),
              userMessage: message,
              steps: response.steps,
              claudeStats: claudeSession.getLastStats(),
            }),
          )
          .catch((err) => console.error('[jev-shadow] failed:', err));
      }

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
  ipcMain.handle(IPC.STEP_EXECUTE, async (_event, stepId: string, action: any, timeout?: number, label?: string) => {
    if (iosMode.active) {
      await iosMode.executeStep(stepId, label ?? '', action, timeout);
      return;
    }
    const win = mainWindow;
    if (!win || !browserView) return;

    win.webContents.send(IPC.STEP_RESULT, stepId, 'running');

    try {
      const beforeScreenshot = await captureBrowserViewScreenshot();

      // Screenshot steps: save to disk and return path
      if (action.type === 'screenshot') {
        const screenshot = await captureBrowserViewScreenshot();
        if (screenshot.length > 0 && projectConfig.getProjectPath()) {
          const fs = await import('fs/promises');
          const config = projectConfig.getConfig();
          const screenshotsDir = path.join(projectConfig.getProjectPath(), config.testOutputDir || 'tests', 'screenshots');
          await fs.mkdir(screenshotsDir, { recursive: true });
          const fileName = `${stepId}-${Date.now()}.png`;
          const filePath = path.join(screenshotsDir, fileName);
          await fs.writeFile(filePath, screenshot);
          win.webContents.send(IPC.STEP_RESULT, stepId, 'passed', undefined, filePath);
        } else {
          win.webContents.send(IPC.STEP_RESULT, stepId, 'passed');
        }
        return;
      }

      await executeActionOnView(browserView, action, timeout);
      win.webContents.send(IPC.STEP_RESULT, stepId, 'passed');
      win.webContents.send(IPC.BROWSER_URL_CHANGED, browserView.webContents.getURL());

      // Wait for DOM to settle, capture after screenshot
      await new Promise(r => setTimeout(r, 500));
      const afterScreenshot = await captureBrowserViewScreenshot();

      claudeSession.addSnapshot(afterScreenshot, browserView.webContents.getURL(), stepId);

      // Run visual QA only when autopilot is enabled
      if (autopilotEnabled) {
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
      } // end autopilot check
    } catch (err) {
      win.webContents.send(IPC.STEP_RESULT, stepId, 'failed', (err as Error).message);
    }
  });

  ipcMain.removeHandler(IPC.STEP_EXECUTE_ALL);
  ipcMain.handle(IPC.STEP_EXECUTE_ALL, async (_event, steps: Array<{ id: string; action: any; timeout?: number; label?: string }>) => {
    if (iosMode.active) {
      for (const step of steps) {
        if (!(await iosMode.executeStep(step.id, step.label ?? '', step.action, step.timeout))) break;
      }
      return;
    }
    const win = mainWindow;
    if (!win || !browserView) return;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      win.webContents.send(IPC.STEP_RESULT, step.id, 'running');

      try {
        const beforeScreenshot = await captureBrowserViewScreenshot();

        await executeActionOnView(browserView, step.action, step.timeout);
        win.webContents.send(IPC.STEP_RESULT, step.id, 'passed');

        await new Promise(r => setTimeout(r, 500));
        const afterScreenshot = await captureBrowserViewScreenshot();
        claudeSession.addSnapshot(afterScreenshot, browserView.webContents.getURL(), step.id);

        // Visual QA every 3rd step and on the final step (only when autopilot is on)
        const isThirdStep = (i + 1) % 3 === 0;
        const isFinalStep = i === steps.length - 1;

        if (autopilotEnabled && (isThirdStep || isFinalStep)) {
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
    await disconnectPlaywright();
    await iosMode.close();
    mainWindow = null;
  });
}

// CDP port for Playwright connection — configurable via SUZIQAI_CDP_PORT env var
export const CDP_PORT = parseInt(process.env.SUZIQAI_CDP_PORT || '9222', 10);

app.commandLine.appendSwitch('remote-debugging-port', String(CDP_PORT));

app.whenReady().then(createWindow);

// Stop the iOS runner on quit; its xcodebuild process would otherwise outlive the app
app.on('before-quit', () => {
  void iosMode.close();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
