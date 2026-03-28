import type { Step, ChatMessage, ProjectConfig, AppMode } from '@shared/types';

export interface SuziQaiAPI {
  sendChat: (message: string) => Promise<void>;
  onChatResponse: (callback: (message: string) => void) => void;
  executeStep: (stepId: string, action?: any) => Promise<void>;
  executeAllSteps: (steps?: Array<{ id: string; action: any }>) => Promise<void>;
  onStepsProposed: (callback: (steps: Step[]) => void) => void;
  onStepResult: (callback: (stepId: string, status: string, error?: string) => void) => void;
  changeMode: (mode: AppMode) => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  onRecordEvent: (callback: (event: unknown) => void) => void;
  onObserveSuggestions: (callback: (suggestions: string) => void) => void;
  navigate: (url: string) => Promise<void>;
  onUrlChanged: (callback: (url: string) => void) => void;
  openProject: (path: string) => Promise<void>;
  onProjectConfig: (callback: (config: ProjectConfig) => void) => void;
  exportTest: (testId: string, outputPath: string) => Promise<void>;
  onExportResult: (callback: (path: string) => void) => void;
  showOpenDialog: () => Promise<string | null>;
  showSaveDialog: (defaultPath: string) => Promise<string | null>;
  readDir: (dirPath: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;
  getHomePath: () => Promise<string>;
  getLastProject: () => Promise<string | null>;
  setLastProject: (path: string) => Promise<void>;
  setViewportBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
  saveSession: (data: any) => Promise<void>;
  loadSession: () => Promise<any>;
  startPicker: () => Promise<void>;
  stopPicker: () => Promise<void>;
  onPickerResult: (callback: (data: any) => void) => void;
  copyToClipboard: (text: string) => Promise<void>;
  removeAllListeners: (channel: string) => void;
  listLibrary: () => Promise<import('@shared/types').LibraryEntry[]>;
  saveToLibrary: (test: import('@shared/types').TestSuite | import('@shared/types').TestCase, fileName?: string) => Promise<{ fileName: string; path: string }>;
  loadFromLibrary: (fileName: string) => Promise<import('@shared/types').TestSuite | import('@shared/types').TestCase>;
  deleteFromLibrary: (fileName: string) => Promise<void>;
}

declare global {
  interface Window {
    suziqai: SuziQaiAPI;
  }
}
