export type StepStatus = 'pending' | 'running' | 'passed' | 'failed';

export type StepAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'assert'; assertionType: AssertionType; expected: string; selector?: string }
  | { type: 'screenshot' }
  | { type: 'waitFor'; selector: string };

export type AssertionType = 'url' | 'visible' | 'text' | 'hidden' | 'value';

export interface Step {
  id: string;
  label: string;
  action: StepAction;
  status: StepStatus;
  error?: string;
}

export interface TestCase {
  id: string;
  name: string;
  steps: Step[];
}

export interface TestBlock {
  id: string;
  name: string;
  steps: Step[];
}

export interface TestSuite {
  id: string;
  name: string;
  beforeEach: Step[];
  tests: TestBlock[];
}

export type AppMode = 'command' | 'record' | 'observe';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ProjectConfig {
  baseUrl: string;
  browser: 'chromium' | 'firefox' | 'webkit';
  testOutputDir: string;
  locatorStrategy: 'recommended' | 'css' | 'testid';
  claudeModel?: string;
}

export interface Snapshot {
  screenshot: Buffer;
  url: string;
  stepId: string;
  timestamp: number;
}

export interface LibraryEntry {
  fileName: string;
  name: string;
  stepCount: number;
  savedAt: string;
  updatedAt: string;
  imported: boolean;
}

// IPC channel names
export const IPC = {
  // Browser
  BROWSER_NAVIGATE: 'browser:navigate',
  BROWSER_URL_CHANGED: 'browser:url-changed',
  BROWSER_READY: 'browser:ready',

  // Steps
  STEP_EXECUTE: 'step:execute',
  STEP_EXECUTE_ALL: 'step:execute-all',
  STEP_RESULT: 'step:result',
  STEPS_PROPOSED: 'steps:proposed',

  // Chat
  CHAT_SEND: 'chat:send',
  CHAT_RESPONSE: 'chat:response',

  // Mode
  MODE_CHANGE: 'mode:change',
  RECORD_START: 'record:start',
  RECORD_STOP: 'record:stop',
  RECORD_EVENT: 'record:event',
  OBSERVE_SUGGESTIONS: 'observe:suggestions',

  // Project
  PROJECT_OPEN: 'project:open',
  PROJECT_CONFIG: 'project:config',

  // Export
  EXPORT_TEST: 'export:test',
  EXPORT_RESULT: 'export:result',

  // Visual QA
  VISUAL_QA_RESULT: 'visual-qa:result',

  // Library
  LIBRARY_LIST: 'library:list',
  LIBRARY_SAVE: 'library:save',
  LIBRARY_LOAD: 'library:load',
  LIBRARY_DELETE: 'library:delete',
} as const;
