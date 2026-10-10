import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '../shared/types';
import type { BrowserManager } from './browser-manager';
import type { ClaudeSession } from './claude-session';
import type { Recorder } from './recorder';
import type { Observer } from './observer';
import type { TestExporter } from './test-exporter';
import type { TestLibrary } from './test-library';
import type { StepAction, PlaywrightConfig, VideoImportProgress } from '../shared/types';
import { validateVideo, extractFrames, batchFrames, analyzeFrameBatch, mergeVideoSteps, cleanupFrames } from './video-analyzer';
import { resolveSelectors } from './selector-resolver';

interface Deps {
  browserManager: BrowserManager;
  claudeSession: ClaudeSession;
  recorder: Recorder;
  observer: Observer;
  testExporter: TestExporter;
  getTestLibrary: () => TestLibrary;
  getWindow: () => BrowserWindow | null;
  getProjectPath?: () => string;
}

export function registerIpcHandlers(deps: Deps): void {
  const { browserManager, claudeSession, recorder, observer, testExporter, getTestLibrary, getWindow } = deps;

  // Browser navigation
  ipcMain.handle(IPC.BROWSER_NAVIGATE, async (_event, url: string) => {
    await browserManager.navigate(url);
    const win = getWindow();
    if (win) win.webContents.send(IPC.BROWSER_URL_CHANGED, browserManager.getCurrentUrl());
  });

  // Chat — send message to Claude with screenshot context
  ipcMain.handle(IPC.CHAT_SEND, async (_event, message: string) => {
    const win = getWindow();
    if (!win) return;

    const context = {
      url: browserManager.getCurrentUrl(),
      accessibilityTree: await browserManager.getAccessibilityTree(),
      screenshot: await browserManager.screenshot(),
    };

    const response = await claudeSession.send(message, context);
    win.webContents.send(IPC.CHAT_RESPONSE, response.message);

    if (response.steps.length > 0) {
      win.webContents.send(IPC.STEPS_PROPOSED, response.steps);
    }
  });

  // Execute a single step with before/after visual QA
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

  // Execute all steps sequentially with throttled visual QA
  ipcMain.handle(IPC.STEP_EXECUTE_ALL, async (_event, steps: Array<{ id: string; action: StepAction }>) => {
    const win = getWindow();
    if (!win) return;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
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

  // Library
  ipcMain.handle(IPC.LIBRARY_LIST, async () => {
    return getTestLibrary().list();
  });

  ipcMain.handle(IPC.LIBRARY_SAVE, async (_event, test: any, fileName?: string, useProjects?: boolean) => {
    return getTestLibrary().save(test, fileName, useProjects);
  });

  ipcMain.handle(IPC.LIBRARY_LOAD, async (_event, fileName: string) => {
    return getTestLibrary().load(fileName);
  });

  ipcMain.handle(IPC.LIBRARY_DELETE, async (_event, fileName: string) => {
    return getTestLibrary().delete(fileName);
  });

  // Playwright config
  ipcMain.handle(IPC.PLAYWRIGHT_CONFIG_SAVE, async (_event, config: PlaywrightConfig, projectPath: string) => {
    return getTestLibrary().savePlaywrightConfig(config, projectPath);
  });

  // Video import — two-pass pipeline
  ipcMain.handle(IPC.VIDEO_IMPORT, async (_event, filePath: string) => {
    const win = getWindow();
    if (!win) return { success: false, error: 'No window' };

    const startTime = Date.now();

    const sendProgress = (progress: VideoImportProgress) => {
      win.webContents.send(IPC.VIDEO_IMPORT_PROGRESS, progress);
    };

    let tmpDir: string | undefined;

    try {
      // Validate video file
      await validateVideo(filePath);

      // Pass 1: Extract frames
      sendProgress({ phase: 'extracting', percent: 5, detail: 'Extracting frames from video...' });
      const extraction = await extractFrames(filePath);
      tmpDir = extraction.tmpDir;
      const frames = extraction.frames;

      if (frames.length === 0) {
        return { success: false, error: 'No frames extracted from video' };
      }

      // Pass 1: Analyze frames via Claude Vision
      sendProgress({ phase: 'analyzing', percent: 15, detail: `Analyzing ${frames.length} frames...` });
      const batches = batchFrames(frames);
      const batchResults = [];

      for (let i = 0; i < batches.length; i++) {
        sendProgress({
          phase: 'analyzing',
          percent: 15 + Math.round((i / batches.length) * 40),
          detail: `Analyzing batch ${i + 1} of ${batches.length}...`,
        });
        const result = await analyzeFrameBatch(batches[i], i, batches.length);
        batchResults.push(result);
      }

      const videoSteps = mergeVideoSteps(batchResults);

      if (videoSteps.length === 0) {
        return { success: false, error: 'No actions detected in the video' };
      }

      // Pass 2: Auto-replay + selector resolution
      sendProgress({ phase: 'replaying', percent: 60, detail: 'Replaying actions in browser...' });

      const resolveResult = await resolveSelectors(
        videoSteps,
        browserManager,
        (detail, stepIndex, totalSteps) => {
          const percent = 60 + Math.round((stepIndex / totalSteps) * 30);
          sendProgress({ phase: 'resolving', percent, detail });
        }
      );

      // Finalize
      sendProgress({ phase: 'finalizing', percent: 95, detail: 'Cleaning up...' });
      await cleanupFrames(tmpDir);

      // Send steps to renderer via existing channel
      if (resolveResult.steps.length > 0) {
        win.webContents.send(IPC.STEPS_PROPOSED, resolveResult.steps);
      }

      sendProgress({ phase: 'finalizing', percent: 100, detail: 'Done' });

      return {
        success: true,
        steps: resolveResult.steps,
        unresolvedCount: resolveResult.unresolvedCount,
        stats: {
          framesExtracted: frames.length,
          batchesSent: batches.length,
          actionsDetected: videoSteps.length,
          selectorsResolved: resolveResult.resolvedCount,
          durationMs: Date.now() - startTime,
        },
      };

    } catch (err) {
      if (tmpDir) await cleanupFrames(tmpDir);
      return { success: false, error: (err as Error).message };
    }
  });
}
