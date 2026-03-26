import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '../shared/types';
import type { BrowserManager } from './browser-manager';
import type { ClaudeSession } from './claude-session';
import type { Recorder } from './recorder';
import type { Observer } from './observer';
import type { TestExporter } from './test-exporter';
import type { StepAction } from '../shared/types';

interface Deps {
  browserManager: BrowserManager;
  claudeSession: ClaudeSession;
  recorder: Recorder;
  observer: Observer;
  testExporter: TestExporter;
  getWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(deps: Deps): void {
  const { browserManager, claudeSession, recorder, observer, testExporter, getWindow } = deps;

  // Browser navigation
  ipcMain.handle(IPC.BROWSER_NAVIGATE, async (_event, url: string) => {
    await browserManager.navigate(url);
    const win = getWindow();
    if (win) win.webContents.send(IPC.BROWSER_URL_CHANGED, browserManager.getCurrentUrl());
  });

  // Chat — send message to Claude, get proposed steps back
  ipcMain.handle(IPC.CHAT_SEND, async (_event, message: string) => {
    const win = getWindow();
    if (!win) return;

    const context = {
      url: browserManager.getCurrentUrl(),
      accessibilityTree: await browserManager.getAccessibilityTree(),
      screenshot: (await browserManager.screenshot()).toString('base64'),
    };

    const response = await claudeSession.send(message, context);
    win.webContents.send(IPC.CHAT_RESPONSE, response.message);

    if (response.steps.length > 0) {
      win.webContents.send(IPC.STEPS_PROPOSED, response.steps);
    }
  });

  // Execute a single step
  ipcMain.handle(IPC.STEP_EXECUTE, async (_event, stepId: string, action: StepAction) => {
    const win = getWindow();
    if (!win) return;

    win.webContents.send(IPC.STEP_RESULT, stepId, 'running');

    try {
      await browserManager.executeAction(action);
      win.webContents.send(IPC.STEP_RESULT, stepId, 'passed');
      win.webContents.send(IPC.BROWSER_URL_CHANGED, browserManager.getCurrentUrl());
    } catch (err) {
      win.webContents.send(IPC.STEP_RESULT, stepId, 'failed', (err as Error).message);
    }
  });

  // Execute all steps sequentially
  ipcMain.handle(IPC.STEP_EXECUTE_ALL, async (_event, steps: Array<{ id: string; action: StepAction }>) => {
    const win = getWindow();
    if (!win) return;

    for (const step of steps) {
      win.webContents.send(IPC.STEP_RESULT, step.id, 'running');
      try {
        await browserManager.executeAction(step.action);
        win.webContents.send(IPC.STEP_RESULT, step.id, 'passed');
      } catch (err) {
        win.webContents.send(IPC.STEP_RESULT, step.id, 'failed', (err as Error).message);
        break;
      }
    }
    win.webContents.send(IPC.BROWSER_URL_CHANGED, browserManager.getCurrentUrl());
  });

  // Mode changes
  ipcMain.handle(IPC.MODE_CHANGE, async (_event, mode: string) => {
    if (mode === 'observe') {
      observer.start();
    } else {
      observer.stop();
    }
  });

  // Recording
  ipcMain.handle(IPC.RECORD_START, async () => {
    const win = getWindow();
    if (!win) return;
    await recorder.start((event) => {
      win.webContents.send(IPC.RECORD_EVENT, event);
    });
  });

  ipcMain.handle(IPC.RECORD_STOP, async () => {
    const rawEvents = recorder.stop();
    const win = getWindow();
    if (!win) return;

    const response = await claudeSession.processRecording(rawEvents);
    win.webContents.send(IPC.CHAT_RESPONSE, response.message);
    if (response.steps.length > 0) {
      win.webContents.send(IPC.STEPS_PROPOSED, response.steps);
    }
  });

  // Export
  ipcMain.handle(IPC.EXPORT_TEST, async (_event, testId: string, outputPath: string) => {
    const win = getWindow();
    if (!win) return;
    const result = await testExporter.export(testId, outputPath);
    win.webContents.send(IPC.EXPORT_RESULT, result);
  });
}
