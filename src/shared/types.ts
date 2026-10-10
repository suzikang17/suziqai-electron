export type StepStatus = 'pending' | 'running' | 'passed' | 'failed';

export type StepAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'press'; selector: string; key: string }
  | { type: 'assert'; assertionType: AssertionType; expected: string; selector?: string; /** for 'attribute' */ attribute?: string }
  | { type: 'screenshot' }
  | { type: 'waitFor'; selector: string };

export type AssertionType = 'url' | 'visible' | 'text' | 'hidden' | 'value' | 'enabled' | 'disabled' | 'checked' | 'unchecked' | 'count' | 'focused' | 'editable' | 'empty' | 'attribute';

export interface Step {
  id: string;
  label: string;
  action: StepAction;
  status: StepStatus;
  error?: string;
  timeout?: number; // ms, default 5000
  screenshotPath?: string; // path to saved screenshot (for screenshot steps)
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

export type HookType = 'beforeAll' | 'beforeEach' | 'afterEach' | 'afterAll';

export interface DeviceConfig {
  name: string;           // Playwright device name (e.g., "iPhone 14") or "Custom"
  viewport?: { width: number; height: number };  // custom viewport override
}

export interface TestSuite {
  id: string;
  name: string;
  fileName: string;
  beforeAll: Step[];
  beforeEach: Step[];
  afterEach: Step[];
  afterAll: Step[];
  tests: TestBlock[];
  devices: DeviceConfig[];  // empty = no device-specific wrapping
  /** Set when the suite was imported from a hand-written spec: lines that couldn't become steps. */
  importNotes?: string[];
}

export interface PlaywrightProject {
  name: string;
  device?: string;        // Playwright device name (e.g., "iPhone 14")
  viewport?: { width: number; height: number };  // custom viewport
  browser?: 'chromium' | 'firefox' | 'webkit';
}

export interface PlaywrightConfig {
  baseURL: string;
  testDir: string;
  projects: PlaywrightProject[];
  timeout: number;           // ms, default 30000
  expectTimeout: number;     // ms, default 5000
  retries: number;           // default 0
  workers: number | string;  // default '50%', can be number or percentage string
  reporter: 'html' | 'json' | 'list' | 'dot';  // default 'html'
  use: {
    headless: boolean;       // default true
    screenshot: 'off' | 'on' | 'only-on-failure';  // default 'only-on-failure'
    video: 'off' | 'on' | 'retain-on-failure';     // default 'off'
    trace: 'off' | 'on' | 'retain-on-failure';     // default 'off'
  };
}

export type AppMode = 'command' | 'record' | 'observe' | 'goal';

// Video import types (Pass 1 output — before selector resolution)
export interface VideoStep {
  label: string;
  actionType: 'navigate' | 'click' | 'fill' | 'press';
  elementHint?: string;   // visual description, e.g. "purple button labeled 'Save' at bottom of modal"
  url?: string;           // for navigate actions
  value?: string;         // for fill actions
  key?: string;           // for press actions, e.g. 'Enter'
  uncertain?: boolean;    // flagged by Claude as low-confidence
  frameIndex?: number;    // source frame index for debugging
}

export interface VideoImportResult {
  success: boolean;
  steps?: Step[];
  unresolvedCount?: number;
  error?: string;
  stats?: {
    framesExtracted: number;
    batchesSent: number;
    actionsDetected: number;
    selectorsResolved: number;
    selectorsByJev?: number;
    selectorsByClaude?: number;
    durationMs: number;
  };
}

export interface VideoImportProgress {
  phase: 'extracting' | 'analyzing' | 'replaying' | 'resolving' | 'finalizing';
  percent: number;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface IosProjectSettings {
  bundleId: string;
  launchArgs?: string[];
  /** Simulator to use; picked automatically when empty. */
  udid?: string;
}

export interface ProjectConfig {
  /** 'web' (default) drives the BrowserView; 'ios' drives a simulator through ios-runner. */
  platform?: 'web' | 'ios';
  ios?: IosProjectSettings;
  /**
   * Read-only mode: the BrowserView blocks every non-GET request except these URL regexes
   * (login, verified read-only RPCs). For recording/replaying against production apps.
   */
  readOnly?: { allow: string[] };
  baseUrl: string;
  browser: 'chromium' | 'firefox' | 'webkit';
  testOutputDir: string;
  locatorStrategy: 'recommended' | 'css' | 'testid';
  claudeModel?: string;
  playwrightConfig?: PlaywrightConfig;
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

  // Playwright config
  PLAYWRIGHT_CONFIG_SAVE: 'playwright:config-save',

  // Video import
  VIDEO_IMPORT: 'video:import',
  VIDEO_IMPORT_PROGRESS: 'video:import:progress',
} as const;
