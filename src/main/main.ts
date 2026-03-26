import { app, BrowserWindow, BrowserView, ipcMain, dialog } from 'electron';
import path from 'path';
import { BrowserManager } from './browser-manager';
import { ClaudeSession } from './claude-session';
import { Recorder } from './recorder';
import { Observer } from './observer';
import { TestExporter } from './test-exporter';
import { ProjectConfigManager } from './project-config';
import { registerIpcHandlers } from './ipc-handlers';
import { IPC } from '../shared/types';

let mainWindow: BrowserWindow | null = null;

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

    await browserManager.launch(config.browser);

    if (mainWindow) {
      mainWindow.webContents.send(IPC.PROJECT_CONFIG, config);
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
