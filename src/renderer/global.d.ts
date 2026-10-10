import type { VideoImportProgress, VideoImportResult, IosProjectSettings, ProjectConfig } from '@shared/types';

declare global {
  interface Window {
    suziqai: {
      // Chat
      sendChat: (message: string) => Promise<void>;
      onChatResponse: (callback: (message: string) => void) => void;

      // Steps
      executeStep: (stepId: string, action?: any, timeout?: number, label?: string) => Promise<void>;
      executeAllSteps: (steps?: any[]) => Promise<void>;
      onStepsProposed: (callback: (steps: unknown[]) => void) => void;
      onStepResult: (callback: (stepId: string, status: string, error?: string, screenshotPath?: string) => void) => void;

      // Mode
      changeMode: (mode: string) => Promise<void>;
      startRecording: () => Promise<void>;
      stopRecording: () => Promise<void>;
      onRecordEvent: (callback: (event: unknown) => void) => void;
      onObserveSuggestions: (callback: (suggestions: string) => void) => void;

      // Browser
      navigate: (url: string) => Promise<void>;
      goBack: () => Promise<void>;
      goForward: () => Promise<void>;
      setAutopilot: (enabled: boolean) => Promise<void>;
      onUrlChanged: (callback: (url: string) => void) => void;

      // Project
      openProject: (path: string, baseUrl?: string, ios?: IosProjectSettings) => Promise<ProjectConfig>;
      onProjectConfig: (callback: (config: unknown) => void) => void;

      // Export
      exportTest: (testId: string, outputPath: string) => Promise<void>;
      onExportResult: (callback: (path: string) => void) => void;

      // Dialog
      showOpenDialog: () => Promise<string | undefined>;
      showSaveDialog: (defaultPath: string) => Promise<string | undefined>;

      // Filesystem
      readDir: (dirPath: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;
      getHomePath: () => Promise<string>;
      getLastProject: () => Promise<string | null>;
      setLastProject: (path: string) => Promise<void>;

      // Viewport
      setViewportBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;

      // Session persistence
      saveSession: (data: any) => Promise<void>;
      loadSession: () => Promise<any>;

      // Cleanup
      removeAllListeners: (channel: string) => void;

      // Element picker
      startPicker: () => Promise<void>;
      stopPicker: () => Promise<void>;
      onPickerResult: (callback: (data: any) => void) => void;

      // Clipboard
      copyToClipboard: (text: string) => Promise<void>;

      // Library
      listLibrary: () => Promise<any[]>;
      saveToLibrary: (test: any, fileName?: string, useProjects?: boolean) => Promise<any>;
      loadFromLibrary: (fileName: string) => Promise<any>;
      deleteFromLibrary: (fileName: string) => Promise<void>;

      // Element highlighting
      highlightElement: (selector: string) => Promise<void>;
      clearHighlight: () => Promise<void>;

      // Playwright config
      savePlaywrightConfig: (config: any, projectPath: string) => Promise<void>;

      // Video import
      importVideo: (filePath: string) => Promise<VideoImportResult>;
      onVideoImportProgress: (callback: (progress: VideoImportProgress) => void) => void;
      onIosScreenshot: (callback: (pngBase64: string) => void) => void;
      onStepResolved: (callback: (stepId: string, selector: string) => void) => void;
    };
  }
}

export {};
