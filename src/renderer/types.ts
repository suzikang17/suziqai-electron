import type { Step, ChatMessage, ProjectConfig, AppMode } from '@shared/types';

export interface SuziQaiAPI {
  sendChat: (message: string) => Promise<void>;
  onChatResponse: (callback: (message: string) => void) => void;
  executeStep: (stepId: string) => Promise<void>;
  executeAllSteps: () => Promise<void>;
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
  setViewportBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
}

declare global {
  interface Window {
    suziqai: SuziQaiAPI;
  }
}
