# suziQai Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Electron desktop app that lets developers interactively create Playwright UI tests using an AI assistant powered by Claude Code.

**Architecture:** Electron main process manages the app window, Playwright browser lifecycle, and Claude Code SDK sessions. The renderer process hosts a three-panel React UI (step sidebar, browser viewport via BrowserView, chat panel). Communication between main and renderer uses Electron IPC. Claude Code SDK runs in the main process and proposes Playwright actions that are intercepted and presented for user approval before execution.

**Tech Stack:** Electron, TypeScript, React, Playwright, Claude Code SDK (`@anthropic-ai/claude-code`), Vite (for renderer bundling)

---

## File Structure

```
suziqai/
├── package.json
├── tsconfig.json
├── vite.config.ts                    # Vite config for renderer
├── electron-builder.json             # Electron packaging config
├── src/
│   ├── main/                         # Electron main process
│   │   ├── main.ts                   # App entry, window creation
│   │   ├── browser-manager.ts        # Playwright browser lifecycle
│   │   ├── ipc-handlers.ts           # IPC handler registration
│   │   ├── claude-session.ts         # Claude Code SDK session management
│   │   ├── recorder.ts              # CDP event capture for Record mode
│   │   ├── observer.ts              # Page state tracking for Observe mode
│   │   ├── test-exporter.ts         # Generate .spec.ts from steps
│   │   └── project-config.ts        # .suziqai/ config management
│   ├── renderer/                     # React UI (renderer process)
│   │   ├── index.html
│   │   ├── index.tsx                 # React entry
│   │   ├── App.tsx                   # Root component, panel layout
│   │   ├── components/
│   │   │   ├── StepSidebar.tsx       # Left panel: test step timeline
│   │   │   ├── StepItem.tsx          # Individual step in sidebar
│   │   │   ├── ChatPanel.tsx         # Bottom-right: AI chat
│   │   │   ├── ChatMessage.tsx       # Individual chat message
│   │   │   ├── BrowserToolbar.tsx    # URL bar, record button, browser selector
│   │   │   ├── ProjectSetup.tsx      # First-launch setup screen
│   │   │   └── StepEditor.tsx        # Inline step editing modal
│   │   ├── hooks/
│   │   │   ├── useIpc.ts            # IPC communication hook
│   │   │   └── useSteps.ts          # Step state management
│   │   ├── types.ts                  # Shared types for renderer
│   │   └── styles/
│   │       └── global.css            # Global styles
│   ├── shared/
│   │   └── types.ts                  # Types shared between main and renderer
│   └── preload/
│       └── preload.ts                # Electron preload script (contextBridge)
├── tests/
│   ├── main/
│   │   ├── browser-manager.test.ts
│   │   ├── claude-session.test.ts
│   │   ├── recorder.test.ts
│   │   ├── observer.test.ts
│   │   ├── test-exporter.test.ts
│   │   └── project-config.test.ts
│   └── renderer/
│       ├── StepSidebar.test.tsx
│       ├── ChatPanel.test.tsx
│       └── App.test.tsx
└── resources/
    └── icon.png                      # App icon
```

---

## Phase 1: Electron Shell & Project Scaffolding

### Task 1: Initialize project and install dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `electron-builder.json`

- [ ] **Step 1: Initialize npm project**

Run: `npm init -y`

- [ ] **Step 2: Update package.json with project metadata and scripts**

```json
{
  "name": "suziqai",
  "version": "0.1.0",
  "description": "AI-assisted browser test authoring with Playwright",
  "main": "dist/main/main.js",
  "scripts": {
    "dev": "concurrently \"vite\" \"tsc -p tsconfig.main.json --watch\" \"electron .\"",
    "build:renderer": "vite build",
    "build:main": "tsc -p tsconfig.main.json",
    "build": "npm run build:renderer && npm run build:main",
    "test": "vitest run",
    "test:watch": "vitest",
    "package": "electron-builder"
  },
  "author": "",
  "license": "MIT"
}
```

- [ ] **Step 3: Install dependencies**

Run:
```bash
npm install electron playwright @anthropic-ai/claude-code react react-dom
npm install -D typescript vite @vitejs/plugin-react vitest @testing-library/react @testing-library/jest-dom jsdom concurrently electron-builder @types/react @types/react-dom
```

- [ ] **Step 4: Create tsconfig.json for renderer**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 5: Create tsconfig.main.json for main process**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist/main",
    "rootDir": "src/main",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/main/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 6: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyDirBeforeWrite: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 5173,
  },
});
```

- [ ] **Step 7: Create electron-builder.json**

```json
{
  "appId": "com.suziqai.app",
  "productName": "suziQai",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "resources/**/*"
  ],
  "mac": {
    "target": "dmg",
    "icon": "resources/icon.png"
  }
}
```

- [ ] **Step 8: Create .gitignore**

```
node_modules/
dist/
release/
.suziqai/
.superpowers/
```

- [ ] **Step 9: Commit**

```bash
git init
git add package.json tsconfig.json tsconfig.main.json vite.config.ts electron-builder.json .gitignore
git commit -m "chore: initialize suziqai project with electron, react, playwright, vite"
```

---

### Task 2: Shared types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Define shared types**

```typescript
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
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared types for steps, modes, IPC channels"
```

---

### Task 3: Electron main process entry

**Files:**
- Create: `src/main/main.ts`
- Create: `src/preload/preload.ts`

- [ ] **Step 1: Create preload script**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types';

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
});
```

- [ ] **Step 2: Create main.ts**

```typescript
import { app, BrowserWindow, BrowserView, ipcMain, dialog } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
let browserView: BrowserView | null = null;

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

  // In dev, load from Vite dev server; in prod, load built files
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    browserView = null;
  });
}

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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

export { mainWindow, browserView };
```

- [ ] **Step 3: Commit**

```bash
git add src/main/main.ts src/preload/preload.ts
git commit -m "feat: electron main process with window creation and preload script"
```

---

### Task 4: React renderer entry and three-panel layout

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/index.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles/global.css`
- Create: `src/renderer/types.ts`

- [ ] **Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>suziQai</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create renderer types.ts**

This extends the global Window type with the preload API.

```typescript
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
}

declare global {
  interface Window {
    suziqai: SuziQaiAPI;
  }
}
```

- [ ] **Step 3: Create global.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-tertiary: #0f3460;
  --bg-dark: #0a0a1a;
  --accent-red: #e94560;
  --accent-green: #4ecca3;
  --accent-yellow: #f5a623;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0b0;
  --text-muted: #606080;
  --border: #2a2a4a;
}

html, body, #root {
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
}

button {
  cursor: pointer;
  border: none;
  font-family: inherit;
}

input, textarea {
  font-family: inherit;
  border: none;
  outline: none;
}
```

- [ ] **Step 4: Create index.tsx**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';
import './types';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

- [ ] **Step 5: Create App.tsx with three-panel layout**

```tsx
import React, { useState } from 'react';
import { StepSidebar } from './components/StepSidebar';
import { ChatPanel } from './components/ChatPanel';
import { BrowserToolbar } from './components/BrowserToolbar';
import type { Step, TestCase, ChatMessage, AppMode } from '@shared/types';

export function App() {
  const [mode, setMode] = useState<AppMode>('command');
  const [currentTest, setCurrentTest] = useState<TestCase>({
    id: '1',
    name: 'Untitled Test',
    steps: [],
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [chatHeight, setChatHeight] = useState(200);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left: Step Sidebar */}
      <div style={{ width: sidebarWidth, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
        <StepSidebar
          testCase={currentTest}
          onAcceptStep={(stepId) => {
            window.suziqai.executeStep(stepId);
          }}
          onDenyStep={(stepId) => {
            setCurrentTest(prev => ({
              ...prev,
              steps: prev.steps.filter(s => s.id !== stepId),
            }));
          }}
          onRunAll={() => {
            window.suziqai.executeAllSteps();
          }}
          onExport={() => {
            window.suziqai.showSaveDialog(`${currentTest.name}.spec.ts`).then(path => {
              if (path) window.suziqai.exportTest(currentTest.id, path);
            });
          }}
        />
      </div>

      {/* Right: Browser + Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top: Browser Toolbar + Viewport */}
        <BrowserToolbar
          url={currentUrl}
          mode={mode}
          isRecording={isRecording}
          onNavigate={(url) => window.suziqai.navigate(url)}
          onModeChange={(newMode) => {
            setMode(newMode);
            window.suziqai.changeMode(newMode);
          }}
          onRecordToggle={() => {
            if (isRecording) {
              window.suziqai.stopRecording();
            } else {
              window.suziqai.startRecording();
            }
            setIsRecording(!isRecording);
          }}
        />
        {/* Browser viewport area — BrowserView is positioned here by main process */}
        <div
          id="browser-viewport"
          style={{
            flex: 1,
            background: 'var(--bg-dark)',
            position: 'relative',
          }}
        />

        {/* Bottom: Chat Panel */}
        <div style={{ height: chatHeight, borderTop: '1px solid var(--border)' }}>
          <ChatPanel
            messages={messages}
            mode={mode}
            onSend={(content) => {
              const userMsg: ChatMessage = {
                id: Date.now().toString(),
                role: 'user',
                content,
                timestamp: Date.now(),
              };
              setMessages(prev => [...prev, userMsg]);
              window.suziqai.sendChat(content);
            }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/
git commit -m "feat: react renderer with three-panel layout shell"
```

---

### Task 5: Step sidebar component

**Files:**
- Create: `src/renderer/components/StepSidebar.tsx`
- Create: `src/renderer/components/StepItem.tsx`

- [ ] **Step 1: Write StepSidebar test**

Create `tests/renderer/StepSidebar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepSidebar } from '../../src/renderer/components/StepSidebar';
import type { TestCase } from '../../src/shared/types';

const mockTest: TestCase = {
  id: '1',
  name: 'Login Test',
  steps: [
    { id: 's1', label: 'Navigate to /login', action: { type: 'navigate', url: '/login' }, status: 'passed' },
    { id: 's2', label: 'Fill email', action: { type: 'fill', selector: '#email', value: 'test@test.com' }, status: 'running' },
    { id: 's3', label: 'Click Sign In', action: { type: 'click', selector: 'button' }, status: 'pending' },
  ],
};

describe('StepSidebar', () => {
  it('renders all steps with correct status indicators', () => {
    render(
      <StepSidebar
        testCase={mockTest}
        onAcceptStep={vi.fn()}
        onDenyStep={vi.fn()}
        onRunAll={vi.fn()}
        onExport={vi.fn()}
      />
    );

    expect(screen.getByText('Navigate to /login')).toBeTruthy();
    expect(screen.getByText('Fill email')).toBeTruthy();
    expect(screen.getByText('Click Sign In')).toBeTruthy();
  });

  it('calls onRunAll when Run All button is clicked', () => {
    const onRunAll = vi.fn();
    render(
      <StepSidebar
        testCase={mockTest}
        onAcceptStep={vi.fn()}
        onDenyStep={vi.fn()}
        onRunAll={onRunAll}
        onExport={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Run All'));
    expect(onRunAll).toHaveBeenCalledOnce();
  });

  it('calls onExport when Export button is clicked', () => {
    const onExport = vi.fn();
    render(
      <StepSidebar
        testCase={mockTest}
        onAcceptStep={vi.fn()}
        onDenyStep={vi.fn()}
        onRunAll={vi.fn()}
        onExport={onExport}
      />
    );

    fireEvent.click(screen.getByText('Export .spec.ts'));
    expect(onExport).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/StepSidebar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create StepItem.tsx**

```tsx
import React from 'react';
import type { Step } from '@shared/types';

const statusIcons: Record<string, { icon: string; color: string }> = {
  passed: { icon: '✓', color: 'var(--accent-green)' },
  running: { icon: '●', color: 'var(--accent-yellow)' },
  pending: { icon: '○', color: 'var(--text-muted)' },
  failed: { icon: '✗', color: 'var(--accent-red)' },
};

interface StepItemProps {
  step: Step;
  index: number;
  onAccept: () => void;
  onDeny: () => void;
}

export function StepItem({ step, index, onAccept, onDeny }: StepItemProps) {
  const { icon, color } = statusIcons[step.status];
  const actionSummary = formatAction(step.action);

  return (
    <div
      style={{
        background: step.status === 'running' ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
        borderRadius: 4,
        padding: 8,
        borderLeft: `3px solid ${color}`,
        opacity: step.status === 'pending' ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ color, fontSize: 12 }}>{icon}</span>
        <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 'bold' }}>
          {index + 1}. {step.label}
        </span>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, paddingLeft: 17 }}>
        {actionSummary}
      </div>
      {step.status === 'pending' && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, paddingLeft: 17 }}>
          <button
            onClick={onAccept}
            style={{
              background: 'var(--accent-green)',
              color: 'var(--bg-primary)',
              borderRadius: 3,
              padding: '2px 8px',
              fontSize: 9,
              fontWeight: 'bold',
            }}
          >
            Accept
          </button>
          <button
            onClick={onDeny}
            style={{
              background: 'var(--accent-red)',
              color: 'white',
              borderRadius: 3,
              padding: '2px 8px',
              fontSize: 9,
              fontWeight: 'bold',
            }}
          >
            Deny
          </button>
        </div>
      )}
      {step.error && (
        <div style={{ color: 'var(--accent-red)', fontSize: 10, paddingLeft: 17, marginTop: 4 }}>
          {step.error}
        </div>
      )}
    </div>
  );
}

function formatAction(action: Step['action']): string {
  switch (action.type) {
    case 'navigate': return `goto('${action.url}')`;
    case 'click': return `click('${action.selector}')`;
    case 'fill': return `fill('${action.selector}', '${action.value}')`;
    case 'assert': return `expect(${action.selector ?? 'page'}).${action.assertionType}('${action.expected}')`;
    case 'screenshot': return 'screenshot()';
    case 'waitFor': return `waitFor('${action.selector}')`;
  }
}
```

- [ ] **Step 4: Create StepSidebar.tsx**

```tsx
import React from 'react';
import { StepItem } from './StepItem';
import type { TestCase } from '@shared/types';

interface StepSidebarProps {
  testCase: TestCase;
  onAcceptStep: (stepId: string) => void;
  onDenyStep: (stepId: string) => void;
  onRunAll: () => void;
  onExport: () => void;
}

export function StepSidebar({ testCase, onAcceptStep, onDenyStep, onRunAll, onExport }: StepSidebarProps) {
  return (
    <div
      style={{
        height: '100%',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', fontSize: 13 }}>Test Steps</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{testCase.name}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {testCase.steps.map((step, i) => (
          <StepItem
            key={step.id}
            step={step}
            index={i}
            onAccept={() => onAcceptStep(step.id)}
            onDeny={() => onDenyStep(step.id)}
          />
        ))}
        {testCase.steps.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 40 }}>
            No steps yet. Use the chat to describe what to test, or start recording.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
        <button
          onClick={onRunAll}
          style={{
            flex: 1,
            background: 'var(--accent-green)',
            color: 'var(--bg-primary)',
            borderRadius: 4,
            padding: 6,
            fontSize: 11,
            fontWeight: 'bold',
          }}
        >
          Run All
        </button>
        <button
          onClick={onExport}
          style={{
            flex: 1,
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            borderRadius: 4,
            padding: 6,
            fontSize: 11,
          }}
        >
          Export .spec.ts
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/renderer/StepSidebar.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/StepSidebar.tsx src/renderer/components/StepItem.tsx tests/renderer/StepSidebar.test.tsx
git commit -m "feat: step sidebar component with accept/deny actions"
```

---

### Task 6: Chat panel component

**Files:**
- Create: `src/renderer/components/ChatPanel.tsx`
- Create: `src/renderer/components/ChatMessage.tsx`

- [ ] **Step 1: Write ChatPanel test**

Create `tests/renderer/ChatPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanel } from '../../src/renderer/components/ChatPanel';
import type { ChatMessage } from '../../src/shared/types';

const mockMessages: ChatMessage[] = [
  { id: '1', role: 'user', content: 'Test the login page', timestamp: 1000 },
  { id: '2', role: 'assistant', content: 'I\'ll navigate to /login and test the form.', timestamp: 1001 },
];

describe('ChatPanel', () => {
  it('renders messages', () => {
    render(<ChatPanel messages={mockMessages} mode="command" onSend={vi.fn()} />);
    expect(screen.getByText('Test the login page')).toBeTruthy();
    expect(screen.getByText("I'll navigate to /login and test the form.")).toBeTruthy();
  });

  it('calls onSend when submitting a message', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} mode="command" onSend={onSend} />);

    const input = screen.getByPlaceholderText('Describe what to test...');
    fireEvent.change(input, { target: { value: 'click the button' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).toHaveBeenCalledWith('click the button');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/ChatPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create ChatMessage.tsx**

```tsx
import React from 'react';
import type { ChatMessage as ChatMessageType } from '@shared/types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <span
        style={{
          color: isUser ? 'var(--accent-red)' : 'var(--accent-green)',
          fontSize: 11,
          fontWeight: 'bold',
          minWidth: 30,
        }}
      >
        {isUser ? 'You:' : 'AI:'}
      </span>
      <span style={{ color: isUser ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 12 }}>
        {message.content}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Create ChatPanel.tsx**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageType, AppMode } from '@shared/types';

interface ChatPanelProps {
  messages: ChatMessageType[];
  mode: AppMode;
  onSend: (content: string) => void;
}

const modeBadge: Record<AppMode, { label: string; color: string }> = {
  command: { label: 'Command', color: 'var(--accent-green)' },
  record: { label: 'Recording', color: 'var(--accent-red)' },
  observe: { label: 'Observing', color: 'var(--accent-yellow)' },
};

export function ChatPanel({ messages, mode, onSend }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  const badge = modeBadge[mode];

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', fontSize: 13 }}>suziQ AI</span>
        <span
          style={{
            color: badge.color,
            fontSize: 9,
            background: 'var(--bg-tertiary)',
            padding: '2px 6px',
            borderRadius: 3,
          }}
        >
          {badge.label}
        </span>
      </div>

      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe what to test..."
          style={{
            flex: 1,
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 12,
          }}
        />
        <button
          type="submit"
          style={{
            background: 'var(--accent-green)',
            color: 'var(--bg-primary)',
            borderRadius: 4,
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 'bold',
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/renderer/ChatPanel.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ChatPanel.tsx src/renderer/components/ChatMessage.tsx tests/renderer/ChatPanel.test.tsx
git commit -m "feat: chat panel component with message history and input"
```

---

### Task 7: Browser toolbar component

**Files:**
- Create: `src/renderer/components/BrowserToolbar.tsx`

- [ ] **Step 1: Create BrowserToolbar.tsx**

```tsx
import React, { useState } from 'react';
import type { AppMode } from '@shared/types';

interface BrowserToolbarProps {
  url: string;
  mode: AppMode;
  isRecording: boolean;
  onNavigate: (url: string) => void;
  onModeChange: (mode: AppMode) => void;
  onRecordToggle: () => void;
}

export function BrowserToolbar({
  url,
  mode,
  isRecording,
  onNavigate,
  onModeChange,
  onRecordToggle,
}: BrowserToolbarProps) {
  const [urlInput, setUrlInput] = useState(url);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate(urlInput);
  };

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Traffic lights placeholder */}
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-red)' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-yellow)' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)' }} />
      </div>

      {/* URL bar */}
      <form onSubmit={handleUrlSubmit} style={{ flex: 1 }}>
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Enter URL..."
          style={{
            width: '100%',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 12,
          }}
        />
      </form>

      {/* Record button */}
      <button
        onClick={onRecordToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: isRecording ? 'var(--accent-red)' : 'var(--bg-tertiary)',
          color: isRecording ? 'white' : 'var(--text-secondary)',
          borderRadius: 4,
          padding: '4px 10px',
          fontSize: 10,
          fontWeight: 'bold',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isRecording ? 'white' : 'var(--accent-red)',
          }}
        />
        {isRecording ? 'Stop' : 'Record'}
      </button>

      {/* Mode selector */}
      <select
        value={mode}
        onChange={(e) => onModeChange(e.target.value as AppMode)}
        style={{
          background: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 10,
          border: 'none',
        }}
      >
        <option value="command">Command</option>
        <option value="record">Record</option>
        <option value="observe">Observe</option>
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/BrowserToolbar.tsx
git commit -m "feat: browser toolbar with URL bar, record toggle, mode selector"
```

---

## Phase 2: Playwright Integration

### Task 8: Browser manager

**Files:**
- Create: `src/main/browser-manager.ts`
- Create: `tests/main/browser-manager.test.ts`

- [ ] **Step 1: Write browser-manager test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserManager } from '../../src/main/browser-manager';

// Integration test — requires Playwright browsers installed
describe('BrowserManager', () => {
  let manager: BrowserManager;

  beforeEach(() => {
    manager = new BrowserManager();
  });

  afterEach(async () => {
    await manager.close();
  });

  it('launches a browser and navigates to a URL', async () => {
    await manager.launch('chromium');
    await manager.navigate('data:text/html,<h1>Hello</h1>');
    const url = manager.getCurrentUrl();
    expect(url).toContain('data:text/html');
  });

  it('executes a click action', async () => {
    await manager.launch('chromium');
    await manager.navigate('data:text/html,<button id="btn">Click me</button>');
    await manager.click('button#btn');
    // No error means success
  });

  it('executes a fill action', async () => {
    await manager.launch('chromium');
    await manager.navigate('data:text/html,<input id="name" />');
    await manager.fill('input#name', 'test value');
    const value = await manager.evaluate('document.querySelector("#name").value');
    expect(value).toBe('test value');
  });

  it('returns an accessibility tree snapshot', async () => {
    await manager.launch('chromium');
    await manager.navigate('data:text/html,<h1>Title</h1><button>Click</button>');
    const snapshot = await manager.getAccessibilityTree();
    expect(snapshot).toContain('Title');
    expect(snapshot).toContain('Click');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/browser-manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement BrowserManager**

```typescript
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';

type BrowserType = 'chromium' | 'firefox' | 'webkit';

const launchers = { chromium, firefox, webkit };

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launch(browserType: BrowserType): Promise<void> {
    const launcher = launchers[browserType];
    this.browser = await launcher.launch({ headless: false });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.goto(url);
  }

  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.click(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.fill(selector, value);
  }

  async waitFor(selector: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.waitForSelector(selector);
  }

  async screenshot(): Promise<Buffer> {
    if (!this.page) throw new Error('Browser not launched');
    return await this.page.screenshot();
  }

  async evaluate(expression: string): Promise<unknown> {
    if (!this.page) throw new Error('Browser not launched');
    return await this.page.evaluate(expression);
  }

  async getAccessibilityTree(): Promise<string> {
    if (!this.page) throw new Error('Browser not launched');
    const snapshot = await this.page.accessibility.snapshot();
    return JSON.stringify(snapshot, null, 2);
  }

  getCurrentUrl(): string {
    if (!this.page) throw new Error('Browser not launched');
    return this.page.url();
  }

  getPage(): Page | null {
    return this.page;
  }

  getCdpSession() {
    if (!this.page) throw new Error('Browser not launched');
    return this.context!.newCDPSession(this.page);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/browser-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/browser-manager.ts tests/main/browser-manager.test.ts
git commit -m "feat: browser manager wrapping playwright for navigation, click, fill, a11y tree"
```

---

### Task 9: IPC handlers connecting renderer to browser

**Files:**
- Create: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Create ipc-handlers.ts**

```typescript
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
  ipcMain.handle(IPC.STEP_EXECUTE, async (_event, stepId: string) => {
    const win = getWindow();
    if (!win) return;

    win.webContents.send(IPC.STEP_RESULT, stepId, 'running');

    try {
      // The step data will be sent from renderer — for now we receive it via a separate channel
      // This will be refined when we wire up the full step execution pipeline
      win.webContents.send(IPC.STEP_RESULT, stepId, 'passed');
    } catch (err) {
      win.webContents.send(IPC.STEP_RESULT, stepId, 'failed', (err as Error).message);
    }
  });

  // Execute all steps
  ipcMain.handle(IPC.STEP_EXECUTE_ALL, async () => {
    // Will be implemented in Phase 3 when step execution pipeline is complete
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

    // Send raw events to Claude for processing
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
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: IPC handlers bridging renderer to browser, claude, recorder, and exporter"
```

---

## Phase 3: Claude Code Integration

### Task 10: Claude Code session manager

**Files:**
- Create: `src/main/claude-session.ts`
- Create: `tests/main/claude-session.test.ts`

- [ ] **Step 1: Write claude-session test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeSession } from '../../src/main/claude-session';

// Mock the claude-code SDK
vi.mock('@anthropic-ai/claude-code', () => ({
  claudeCode: vi.fn(),
}));

import { claudeCode } from '@anthropic-ai/claude-code';

describe('ClaudeSession', () => {
  let session: ClaudeSession;

  beforeEach(() => {
    session = new ClaudeSession();
    vi.clearAllMocks();
  });

  it('sends a message with page context and parses step responses', async () => {
    const mockResponse = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: "I'll navigate to /login and fill in the form.",
            steps: [
              { label: 'Navigate to /login', action: { type: 'navigate', url: '/login' } },
              { label: 'Fill email', action: { type: 'fill', selector: 'input[name="email"]', value: 'test@test.com' } },
            ],
          }),
        },
      ],
    };

    vi.mocked(claudeCode).mockResolvedValue(mockResponse as any);

    const result = await session.send('test the login page', {
      url: 'http://localhost:3000',
      accessibilityTree: '{"role":"document","children":[]}',
      screenshot: 'base64data',
    });

    expect(result.message).toBe("I'll navigate to /login and fill in the form.");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].label).toBe('Navigate to /login');
    expect(result.steps[0].action.type).toBe('navigate');
  });

  it('handles responses with no steps', async () => {
    const mockResponse = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'What would you like me to test?',
            steps: [],
          }),
        },
      ],
    };

    vi.mocked(claudeCode).mockResolvedValue(mockResponse as any);

    const result = await session.send('help', {
      url: 'http://localhost:3000',
      accessibilityTree: '{}',
      screenshot: '',
    });

    expect(result.message).toBe('What would you like me to test?');
    expect(result.steps).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/claude-session.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ClaudeSession**

```typescript
import { claudeCode } from '@anthropic-ai/claude-code';
import type { Step, StepAction } from '../shared/types';

interface PageContext {
  url: string;
  accessibilityTree: string;
  screenshot: string;
}

interface ClaudeResponse {
  message: string;
  steps: Array<{ label: string; action: StepAction }>;
}

const SYSTEM_PROMPT = `You are suziQai, an AI assistant that helps developers write Playwright UI tests.

You control a browser through these actions:
- navigate(url): Navigate to a URL
- click(selector): Click an element (prefer getByRole, getByLabel, getByText selectors)
- fill(selector, value): Type into an input field
- assert(assertionType, expected, selector?): Add a test assertion. Types: url, visible, text, hidden, value
- screenshot(): Capture the current browser state
- waitFor(selector): Wait for an element to appear

When the user describes what to test, respond with a JSON object:
{
  "message": "Your conversational response explaining what you'll do",
  "steps": [
    { "label": "Human-readable step description", "action": { "type": "navigate", "url": "/login" } },
    { "label": "Fill in email", "action": { "type": "fill", "selector": "getByLabel('Email')", "value": "test@test.com" } }
  ]
}

Use Playwright's recommended locator strategy:
1. getByRole — most resilient
2. getByLabel — form elements
3. getByText — visible text
4. getByTestId — data-testid attributes
5. CSS selectors — last resort

Always respond with valid JSON. Keep conversational messages concise.`;

export class ClaudeSession {
  private conversationHistory: Array<{ role: string; content: string }> = [];

  async send(userMessage: string, context: PageContext): Promise<ClaudeResponse> {
    const contextBlock = `[Current page: ${context.url}]
[Accessibility tree: ${context.accessibilityTree}]`;

    const fullMessage = `${contextBlock}\n\nUser: ${userMessage}`;

    this.conversationHistory.push({ role: 'user', content: fullMessage });

    const response = await claudeCode({
      prompt: fullMessage,
      systemPrompt: SYSTEM_PROMPT,
      options: {
        maxTokens: 4096,
      },
    });

    const text = typeof response === 'string'
      ? response
      : Array.isArray(response.content)
        ? response.content.find((c: any) => c.type === 'text')?.text ?? ''
        : '';

    try {
      const parsed: ClaudeResponse = JSON.parse(text);
      this.conversationHistory.push({ role: 'assistant', content: text });

      return {
        message: parsed.message,
        steps: (parsed.steps ?? []).map((s, i) => ({
          label: s.label,
          action: s.action,
        })),
      };
    } catch {
      // If response isn't valid JSON, treat it as a plain message
      return { message: text, steps: [] };
    }
  }

  async processRecording(rawEvents: Array<{ type: string; selector?: string; value?: string }>): Promise<ClaudeResponse> {
    const message = `I recorded these browser interactions. Please convert them into clean, well-structured Playwright test steps using semantic locators. Deduplicate redundant actions, group related actions, and suggest assertions for what changed.

Raw events:
${JSON.stringify(rawEvents, null, 2)}`;

    return this.send(message, {
      url: '',
      accessibilityTree: '',
      screenshot: '',
    });
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/claude-session.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/claude-session.ts tests/main/claude-session.test.ts
git commit -m "feat: claude code session manager with context packaging and step parsing"
```

---

### Task 11: Step execution pipeline

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/browser-manager.ts`

This task connects the approved steps from the sidebar to actual Playwright execution.

- [ ] **Step 1: Add executeAction method to BrowserManager**

Add this method to `src/main/browser-manager.ts`:

```typescript
async executeAction(action: StepAction): Promise<void> {
  if (!this.page) throw new Error('Browser not launched');

  switch (action.type) {
    case 'navigate':
      await this.page.goto(action.url);
      break;
    case 'click':
      await this.page.click(action.selector);
      break;
    case 'fill':
      await this.page.fill(action.selector, action.value);
      break;
    case 'waitFor':
      await this.page.waitForSelector(action.selector);
      break;
    case 'screenshot':
      await this.page.screenshot();
      break;
    case 'assert':
      await this.executeAssertion(action);
      break;
  }
}

private async executeAssertion(action: Extract<StepAction, { type: 'assert' }>): Promise<void> {
  if (!this.page) throw new Error('Browser not launched');
  const { assertionType, expected, selector } = action;

  switch (assertionType) {
    case 'url':
      if (this.page.url() !== expected) {
        throw new Error(`Expected URL "${expected}", got "${this.page.url()}"`);
      }
      break;
    case 'visible':
      await this.page.waitForSelector(selector!, { state: 'visible', timeout: 5000 });
      break;
    case 'text': {
      const text = await this.page.textContent(selector!);
      if (!text?.includes(expected)) {
        throw new Error(`Expected text "${expected}" in "${selector}", got "${text}"`);
      }
      break;
    }
    case 'hidden':
      await this.page.waitForSelector(selector!, { state: 'hidden', timeout: 5000 });
      break;
    case 'value': {
      const value = await this.page.inputValue(selector!);
      if (value !== expected) {
        throw new Error(`Expected value "${expected}" in "${selector}", got "${value}"`);
      }
      break;
    }
  }
}
```

Add the import at the top of `browser-manager.ts`:

```typescript
import type { StepAction } from '../shared/types';
```

- [ ] **Step 2: Update IPC handler for step execution**

Replace the `STEP_EXECUTE` handler in `src/main/ipc-handlers.ts` to accept step data:

```typescript
// Execute a single step — renderer sends the step action data
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
      break; // Stop on first failure
    }
  }
  win.webContents.send(IPC.BROWSER_URL_CHANGED, browserManager.getCurrentUrl());
});
```

- [ ] **Step 3: Commit**

```bash
git add src/main/browser-manager.ts src/main/ipc-handlers.ts
git commit -m "feat: step execution pipeline connecting sidebar actions to playwright"
```

---

## Phase 4: Record & Observe Modes

### Task 12: Recorder (CDP event capture)

**Files:**
- Create: `src/main/recorder.ts`
- Create: `tests/main/recorder.test.ts`

- [ ] **Step 1: Write recorder test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Recorder, RecordedEvent } from '../../src/main/recorder';

describe('Recorder', () => {
  it('starts and stops recording, returning captured events', () => {
    const recorder = new Recorder();
    const callback = vi.fn();

    recorder.start(callback);

    // Simulate events being pushed (in real usage, CDP pushes these)
    recorder.pushEvent({ type: 'click', selector: 'button#submit', timestamp: 1000 });
    recorder.pushEvent({ type: 'fill', selector: 'input#email', value: 'test@test.com', timestamp: 1001 });

    expect(callback).toHaveBeenCalledTimes(2);

    const events = recorder.stop();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('click');
    expect(events[1].type).toBe('fill');
  });

  it('clears events on start', () => {
    const recorder = new Recorder();
    recorder.start(vi.fn());
    recorder.pushEvent({ type: 'click', selector: 'a', timestamp: 1 });
    recorder.stop();

    recorder.start(vi.fn());
    const events = recorder.stop();
    expect(events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/recorder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Recorder**

```typescript
export interface RecordedEvent {
  type: 'click' | 'fill' | 'navigate' | 'keypress';
  selector?: string;
  value?: string;
  url?: string;
  timestamp: number;
}

type EventCallback = (event: RecordedEvent) => void;

export class Recorder {
  private events: RecordedEvent[] = [];
  private callback: EventCallback | null = null;
  private isRecording = false;

  async start(callback: EventCallback): Promise<void> {
    this.events = [];
    this.callback = callback;
    this.isRecording = true;

    // In the real app, this will attach CDP listeners to the Playwright page:
    // const cdp = await page.context().newCDPSession(page);
    // await cdp.send('DOM.enable');
    // await cdp.send('Runtime.enable');
    // cdp.on('Runtime.consoleAPICalled', ...)
    // For now, events are pushed manually via pushEvent() and
    // the CDP wiring will be done when integrating with BrowserManager
  }

  stop(): RecordedEvent[] {
    this.isRecording = false;
    this.callback = null;
    return [...this.events];
  }

  pushEvent(event: RecordedEvent): void {
    if (!this.isRecording) return;
    this.events.push(event);
    this.callback?.(event);
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/recorder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/recorder.ts tests/main/recorder.test.ts
git commit -m "feat: recorder for capturing browser interaction events"
```

---

### Task 13: Observer (silent watching + suggestions)

**Files:**
- Create: `src/main/observer.ts`
- Create: `tests/main/observer.test.ts`

- [ ] **Step 1: Write observer test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Observer } from '../../src/main/observer';

describe('Observer', () => {
  let observer: Observer;

  beforeEach(() => {
    observer = new Observer();
  });

  it('tracks page state changes', () => {
    observer.start();
    observer.recordState({
      url: 'http://localhost:3000/login',
      title: 'Login',
      visibleText: ['Email', 'Password', 'Sign In'],
    });
    observer.recordState({
      url: 'http://localhost:3000/dashboard',
      title: 'Dashboard',
      visibleText: ['Welcome back', 'Settings', 'Logout'],
    });

    const history = observer.getStateHistory();
    expect(history).toHaveLength(2);
    expect(history[0].url).toBe('http://localhost:3000/login');
    expect(history[1].url).toBe('http://localhost:3000/dashboard');
  });

  it('generates a summary of observed navigation', () => {
    observer.start();
    observer.recordState({
      url: 'http://localhost:3000/login',
      title: 'Login',
      visibleText: ['Email', 'Password', 'Sign In'],
    });
    observer.recordState({
      url: 'http://localhost:3000/dashboard',
      title: 'Dashboard',
      visibleText: ['Welcome back'],
    });

    const summary = observer.getSummary();
    expect(summary).toContain('/login');
    expect(summary).toContain('/dashboard');
  });

  it('clears history on stop', () => {
    observer.start();
    observer.recordState({ url: 'http://localhost:3000', title: 'Home', visibleText: [] });
    observer.stop();

    expect(observer.getStateHistory()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/observer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Observer**

```typescript
export interface PageState {
  url: string;
  title: string;
  visibleText: string[];
  timestamp?: number;
}

export class Observer {
  private stateHistory: PageState[] = [];
  private isObserving = false;

  start(): void {
    this.stateHistory = [];
    this.isObserving = true;
  }

  stop(): void {
    this.isObserving = false;
    this.stateHistory = [];
  }

  recordState(state: PageState): void {
    if (!this.isObserving) return;
    this.stateHistory.push({
      ...state,
      timestamp: state.timestamp ?? Date.now(),
    });
  }

  getStateHistory(): PageState[] {
    return [...this.stateHistory];
  }

  getSummary(): string {
    if (this.stateHistory.length === 0) return 'No pages observed yet.';

    const lines = this.stateHistory.map((state, i) => {
      const texts = state.visibleText.slice(0, 5).join(', ');
      return `${i + 1}. ${state.url} (${state.title}) — visible: [${texts}]`;
    });

    return `Observed ${this.stateHistory.length} page states:\n${lines.join('\n')}`;
  }

  getIsObserving(): boolean {
    return this.isObserving;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/observer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/observer.ts tests/main/observer.test.ts
git commit -m "feat: observer for silent page state tracking and summary generation"
```

---

## Phase 5: Test Export

### Task 14: Test exporter

**Files:**
- Create: `src/main/test-exporter.ts`
- Create: `tests/main/test-exporter.test.ts`

- [ ] **Step 1: Write test-exporter test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestExporter } from '../../src/main/test-exporter';
import type { Step } from '../../src/shared/types';

// Mock claude-code SDK
vi.mock('@anthropic-ai/claude-code', () => ({
  claudeCode: vi.fn(),
}));

// Mock fs
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { claudeCode } from '@anthropic-ai/claude-code';
import { writeFile } from 'fs/promises';

describe('TestExporter', () => {
  let exporter: TestExporter;

  const mockSteps: Step[] = [
    { id: '1', label: 'Navigate to /login', action: { type: 'navigate', url: '/login' }, status: 'passed' },
    { id: '2', label: 'Fill email', action: { type: 'fill', selector: "getByLabel('Email')", value: 'test@test.com' }, status: 'passed' },
    { id: '3', label: 'Click Sign In', action: { type: 'click', selector: "getByRole('button', { name: 'Sign In' })" }, status: 'passed' },
    { id: '4', label: 'Assert dashboard URL', action: { type: 'assert', assertionType: 'url', expected: '/dashboard' }, status: 'passed' },
  ];

  beforeEach(() => {
    exporter = new TestExporter();
    vi.clearAllMocks();
  });

  it('generates a valid playwright test file from steps', async () => {
    const expectedCode = `import { test, expect } from '@playwright/test';

test.describe('Login flow', () => {
  test('should log in with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@test.com');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard');
  });
});`;

    vi.mocked(claudeCode).mockResolvedValue({
      content: [{ type: 'text', text: expectedCode }],
    } as any);

    const result = await exporter.exportSteps('Login flow', mockSteps, '/tmp/login.spec.ts');

    expect(writeFile).toHaveBeenCalledWith('/tmp/login.spec.ts', expectedCode, 'utf-8');
    expect(result).toBe('/tmp/login.spec.ts');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/test-exporter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TestExporter**

```typescript
import { claudeCode } from '@anthropic-ai/claude-code';
import { writeFile } from 'fs/promises';
import type { Step } from '../shared/types';

const EXPORT_PROMPT = `You are a Playwright test code generator. Given a list of test steps, generate a complete, idiomatic Playwright test file.

Rules:
- Use import { test, expect } from '@playwright/test'
- Use test.describe for grouping
- Use test.beforeEach for shared setup if there are multiple tests
- Use Playwright's recommended locator strategy: getByRole > getByLabel > getByText > getByTestId > CSS
- Generate meaningful test names from the step intent
- Output ONLY the TypeScript code, no markdown fences, no explanation`;

export class TestExporter {
  async exportSteps(testName: string, steps: Step[], outputPath: string): Promise<string> {
    const stepsDescription = steps.map((s, i) => {
      const action = s.action;
      return `${i + 1}. ${s.label} — ${JSON.stringify(action)}`;
    }).join('\n');

    const prompt = `${EXPORT_PROMPT}

Test name: "${testName}"

Steps:
${stepsDescription}

Generate the Playwright test file:`;

    const response = await claudeCode({
      prompt,
      options: { maxTokens: 4096 },
    });

    const code = typeof response === 'string'
      ? response
      : Array.isArray(response.content)
        ? response.content.find((c: any) => c.type === 'text')?.text ?? ''
        : '';

    // Strip markdown code fences if present
    const cleanCode = code.replace(/^```\w*\n/, '').replace(/\n```$/, '').trim();

    await writeFile(outputPath, cleanCode, 'utf-8');
    return outputPath;
  }

  async export(testId: string, outputPath: string): Promise<string> {
    // This method is called from IPC — it will look up the test by ID from a store
    // For now, this is a placeholder that will be wired up when we add test state management
    return outputPath;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/test-exporter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/test-exporter.ts tests/main/test-exporter.test.ts
git commit -m "feat: test exporter generating playwright spec files via claude code"
```

---

## Phase 6: Project Configuration

### Task 15: Project config manager

**Files:**
- Create: `src/main/project-config.ts`
- Create: `tests/main/project-config.test.ts`

- [ ] **Step 1: Write project-config test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectConfigManager } from '../../src/main/project-config';
import path from 'path';

// Mock fs
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn(),
}));

import { readFile, writeFile, mkdir, access } from 'fs/promises';

describe('ProjectConfigManager', () => {
  let manager: ProjectConfigManager;

  beforeEach(() => {
    manager = new ProjectConfigManager();
    vi.clearAllMocks();
  });

  it('creates default config when none exists', async () => {
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const config = await manager.load('/projects/myapp');

    expect(config.baseUrl).toBe('http://localhost:3000');
    expect(config.browser).toBe('chromium');
    expect(config.testOutputDir).toBe('tests');
    expect(mkdir).toHaveBeenCalledWith(path.join('/projects/myapp', '.suziqai'), { recursive: true });
  });

  it('reads existing config', async () => {
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({
      baseUrl: 'http://localhost:8080',
      browser: 'firefox',
      testOutputDir: 'e2e',
      locatorStrategy: 'testid',
    }));

    const config = await manager.load('/projects/myapp');

    expect(config.baseUrl).toBe('http://localhost:8080');
    expect(config.browser).toBe('firefox');
    expect(config.testOutputDir).toBe('e2e');
  });

  it('detects existing playwright config', async () => {
    vi.mocked(access).mockImplementation(async (p) => {
      if (String(p).includes('playwright.config')) return undefined;
      throw new Error('ENOENT');
    });
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const hasPlaywright = await manager.detectPlaywright('/projects/myapp');
    expect(hasPlaywright).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/project-config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProjectConfigManager**

```typescript
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import path from 'path';
import type { ProjectConfig } from '../shared/types';

const DEFAULT_CONFIG: ProjectConfig = {
  baseUrl: 'http://localhost:3000',
  browser: 'chromium',
  testOutputDir: 'tests',
  locatorStrategy: 'recommended',
};

export class ProjectConfigManager {
  private projectPath: string = '';
  private config: ProjectConfig = { ...DEFAULT_CONFIG };

  async load(projectPath: string): Promise<ProjectConfig> {
    this.projectPath = projectPath;
    const configDir = path.join(projectPath, '.suziqai');
    const configPath = path.join(configDir, 'config.json');

    try {
      await access(configPath);
      const data = await readFile(configPath, 'utf-8');
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch {
      // No config exists — create default
      await mkdir(configDir, { recursive: true });
      await this.save();
    }

    return this.config;
  }

  async save(): Promise<void> {
    const configDir = path.join(this.projectPath, '.suziqai');
    const configPath = path.join(configDir, 'config.json');
    await mkdir(configDir, { recursive: true });
    await writeFile(configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  async update(partial: Partial<ProjectConfig>): Promise<ProjectConfig> {
    this.config = { ...this.config, ...partial };
    await this.save();
    return this.config;
  }

  async detectPlaywright(projectPath: string): Promise<boolean> {
    try {
      await access(path.join(projectPath, 'playwright.config.ts'));
      return true;
    } catch {
      try {
        await access(path.join(projectPath, 'playwright.config.js'));
        return true;
      } catch {
        return false;
      }
    }
  }

  getConfig(): ProjectConfig {
    return { ...this.config };
  }

  getProjectPath(): string {
    return this.projectPath;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/project-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/project-config.ts tests/main/project-config.test.ts
git commit -m "feat: project config manager with .suziqai directory and playwright detection"
```

---

### Task 16: Project setup screen

**Files:**
- Create: `src/renderer/components/ProjectSetup.tsx`

- [ ] **Step 1: Create ProjectSetup.tsx**

```tsx
import React, { useState } from 'react';

interface ProjectSetupProps {
  onProjectOpened: (path: string) => void;
}

export function ProjectSetup({ onProjectOpened }: ProjectSetupProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleOpen = async () => {
    const path = await window.suziqai.showOpenDialog();
    if (!path) return;

    setStatus('loading');
    try {
      await window.suziqai.openProject(path);
      onProjectOpened(path);
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <h1 style={{ color: 'var(--accent-red)', fontSize: 36, marginBottom: 8 }}>suziQai</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>
          AI-assisted browser test authoring
        </p>

        <button
          onClick={handleOpen}
          disabled={status === 'loading'}
          style={{
            background: 'var(--accent-green)',
            color: 'var(--bg-primary)',
            borderRadius: 6,
            padding: '12px 32px',
            fontSize: 14,
            fontWeight: 'bold',
            opacity: status === 'loading' ? 0.6 : 1,
          }}
        >
          {status === 'loading' ? 'Opening...' : 'Open Project'}
        </button>

        {status === 'error' && (
          <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 16 }}>{error}</p>
        )}

        <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 24 }}>
          Select a project directory to get started.
          <br />
          suziQai will detect your Playwright configuration automatically.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx to show setup screen when no project is open**

Add a `projectPath` state to `App.tsx` and conditionally render `ProjectSetup`:

```tsx
// Add to existing state declarations in App.tsx:
const [projectPath, setProjectPath] = useState<string | null>(null);

// Wrap the return in a conditional:
if (!projectPath) {
  return <ProjectSetup onProjectOpened={setProjectPath} />;
}

// ... existing three-panel layout
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ProjectSetup.tsx src/renderer/App.tsx
git commit -m "feat: project setup screen with directory picker and playwright detection"
```

---

### Task 17: Wire everything together in main.ts

**Files:**
- Modify: `src/main/main.ts`

- [ ] **Step 1: Update main.ts to initialize all services and register IPC**

```typescript
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
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
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
```

- [ ] **Step 2: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: wire all services together in main process entry"
```

---

### Task 18: Vitest configuration

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add vitest configuration with jsdom and path aliases"
```

---

### Task 19: Smoke test — launch the app

- [ ] **Step 1: Build and verify the app launches**

Run:
```bash
npm run build:main
npm run build:renderer
npx electron .
```

Expected: Electron window opens showing the "suziQai" welcome screen with "Open Project" button.

- [ ] **Step 2: Verify project opening flow**

1. Click "Open Project"
2. Select any directory
3. Verify the three-panel layout appears
4. Verify a Playwright browser launches

- [ ] **Step 3: Commit any fixes needed**

```bash
git add -A
git commit -m "fix: smoke test corrections for app launch"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1. Shell & Scaffolding | Tasks 1-7 | Electron app with three-panel React UI |
| 2. Playwright Integration | Tasks 8-9 | Browser control via IPC |
| 3. Claude Code Integration | Tasks 10-11 | AI-powered step proposal and execution |
| 4. Record & Observe | Tasks 12-13 | Record mode capture, Observe mode tracking |
| 5. Test Export | Task 14 | Generate .spec.ts files |
| 6. Configuration | Tasks 15-19 | Project setup, config, final wiring |

Each phase builds on the previous and produces a testable increment. Phase 1-2 gives you a working Electron + Playwright shell. Adding Phase 3 makes it AI-powered. Phase 4-5 complete the feature set. Phase 6 polishes the setup experience.
