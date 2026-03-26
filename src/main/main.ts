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
  ipcMain.handle(IPC.PROJECT_OPEN, async (_event, projectPath: string) => {
    const config = await projectConfig.load(projectPath);
    const hasPlaywright = await projectConfig.detectPlaywright(projectPath);

    if (!hasPlaywright) {
      // Could prompt to install — for now just proceed
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

    // Navigate to the project's base URL
    browserView.webContents.loadURL(config.baseUrl);

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

  // Viewport bounds — position the BrowserView over the viewport div
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
