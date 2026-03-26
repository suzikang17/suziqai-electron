import { contextBridge, ipcRenderer } from 'electron';

// IPC channel names inlined to avoid cross-module require in sandboxed preload
const IPC = {
  BROWSER_NAVIGATE: 'browser:navigate',
  BROWSER_URL_CHANGED: 'browser:url-changed',
  STEP_EXECUTE: 'step:execute',
  STEP_EXECUTE_ALL: 'step:execute-all',
  STEP_RESULT: 'step:result',
  STEPS_PROPOSED: 'steps:proposed',
  CHAT_SEND: 'chat:send',
  CHAT_RESPONSE: 'chat:response',
  MODE_CHANGE: 'mode:change',
  RECORD_START: 'record:start',
  RECORD_STOP: 'record:stop',
  RECORD_EVENT: 'record:event',
  OBSERVE_SUGGESTIONS: 'observe:suggestions',
  PROJECT_OPEN: 'project:open',
  PROJECT_CONFIG: 'project:config',
  EXPORT_TEST: 'export:test',
  EXPORT_RESULT: 'export:result',
  READ_DIR: 'fs:read-dir',
} as const;

contextBridge.exposeInMainWorld('suziqai', {
  // Chat
  sendChat: (message: string) => ipcRenderer.invoke(IPC.CHAT_SEND, message),
  onChatResponse: (callback: (message: string) => void) =>
    ipcRenderer.on(IPC.CHAT_RESPONSE, (_event, message) => callback(message)),

  // Steps
  executeStep: (stepId: string) => ipcRenderer.invoke(IPC.STEP_EXECUTE, stepId),
  executeAllSteps: () => ipcRenderer.invoke(IPC.STEP_EXECUTE_ALL),
  onStepsProposed: (callback: (steps: unknown[]) => void) =>
    ipcRenderer.on(IPC.STEPS_PROPOSED, (_event, steps) => callback(steps)),
  onStepResult: (callback: (stepId: string, status: string, error?: string) => void) =>
    ipcRenderer.on(IPC.STEP_RESULT, (_event, stepId, status, error) => callback(stepId, status, error)),

  // Mode
  changeMode: (mode: string) => ipcRenderer.invoke(IPC.MODE_CHANGE, mode),
  startRecording: () => ipcRenderer.invoke(IPC.RECORD_START),
  stopRecording: () => ipcRenderer.invoke(IPC.RECORD_STOP),
  onRecordEvent: (callback: (event: unknown) => void) =>
    ipcRenderer.on(IPC.RECORD_EVENT, (_event, data) => callback(data)),
  onObserveSuggestions: (callback: (suggestions: string) => void) =>
    ipcRenderer.on(IPC.OBSERVE_SUGGESTIONS, (_event, suggestions) => callback(suggestions)),

  // Browser
  navigate: (url: string) => ipcRenderer.invoke(IPC.BROWSER_NAVIGATE, url),
  onUrlChanged: (callback: (url: string) => void) =>
    ipcRenderer.on(IPC.BROWSER_URL_CHANGED, (_event, url) => callback(url)),

  // Project
  openProject: (path: string) => ipcRenderer.invoke(IPC.PROJECT_OPEN, path),
  onProjectConfig: (callback: (config: unknown) => void) =>
    ipcRenderer.on(IPC.PROJECT_CONFIG, (_event, config) => callback(config)),

  // Export
  exportTest: (testId: string, outputPath: string) => ipcRenderer.invoke(IPC.EXPORT_TEST, testId, outputPath),
  onExportResult: (callback: (path: string) => void) =>
    ipcRenderer.on(IPC.EXPORT_RESULT, (_event, path) => callback(path)),

  // Dialog
  showOpenDialog: () => ipcRenderer.invoke('dialog:open'),
  showSaveDialog: (defaultPath: string) => ipcRenderer.invoke('dialog:save', defaultPath),

  // Filesystem
  readDir: (dirPath: string) => ipcRenderer.invoke('fs:read-dir', dirPath),
  getHomePath: () => ipcRenderer.invoke('fs:home-path'),
});
