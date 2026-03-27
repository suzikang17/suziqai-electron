# Test Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a file-system-first test library so users can save, browse, load, and delete Playwright test files from the sidebar.

**Architecture:** Saved tests are `.spec.ts` + `.suziqai.json` sidecar pairs in the project's `testOutputDir`. The sidebar gets a Session/Library toggle. Four new IPC channels handle save/load/list/delete. The file system is the source of truth — no index file.

**Tech Stack:** Electron IPC, Node.js fs, React, Vitest

---

### Task 1: Add shared types for the library

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/types.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { IPC } from '../../src/shared/types';
import type { LibraryEntry } from '../../src/shared/types';

describe('Library types', () => {
  it('exports library IPC channel constants', () => {
    expect(IPC.LIBRARY_LIST).toBe('library:list');
    expect(IPC.LIBRARY_SAVE).toBe('library:save');
    expect(IPC.LIBRARY_LOAD).toBe('library:load');
    expect(IPC.LIBRARY_DELETE).toBe('library:delete');
  });

  it('LibraryEntry type is usable', () => {
    const entry: LibraryEntry = {
      fileName: 'login-flow',
      name: 'Login flow',
      stepCount: 3,
      savedAt: '2026-03-27T10:00:00Z',
      updatedAt: '2026-03-27T10:00:00Z',
      imported: false,
    };
    expect(entry.fileName).toBe('login-flow');
    expect(entry.imported).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/types.test.ts`
Expected: FAIL — `IPC.LIBRARY_LIST` is undefined, `LibraryEntry` not exported

- [ ] **Step 3: Add types and IPC constants**

In `src/shared/types.ts`, add the `LibraryEntry` interface after the existing `Snapshot` interface:

```typescript
export interface LibraryEntry {
  fileName: string;
  name: string;
  stepCount: number;
  savedAt: string;
  updatedAt: string;
  imported: boolean;
}
```

And add library channels to the existing `IPC` const, inside the object before `as const`:

```typescript
  // Library
  LIBRARY_LIST: 'library:list',
  LIBRARY_SAVE: 'library:save',
  LIBRARY_LOAD: 'library:load',
  LIBRARY_DELETE: 'library:delete',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts tests/shared/types.test.ts
git commit -m "feat(library): add LibraryEntry type and IPC channel constants"
```

---

### Task 2: Implement test-library.ts (main process file operations)

**Files:**
- Create: `src/main/test-library.ts`
- Test: `tests/main/test-library.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/test-library.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { TestLibrary } from '../../src/main/test-library';
import type { TestCase } from '../../src/shared/types';

describe('TestLibrary', () => {
  let tmpDir: string;
  let testOutputDir: string;
  let library: TestLibrary;

  const mockTest: TestCase = {
    id: 'test-1',
    name: 'Login flow',
    steps: [
      { id: 's1', label: 'Navigate to /login', action: { type: 'navigate', url: '/login' }, status: 'passed' },
      { id: 's2', label: 'Click sign in', action: { type: 'click', selector: "getByRole('button', { name: 'Sign In' })" }, status: 'passed' },
    ],
  };

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'suziqai-lib-'));
    testOutputDir = path.join(tmpDir, 'tests');
    await mkdir(testOutputDir, { recursive: true });
    library = new TestLibrary(testOutputDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('save', () => {
    it('writes a .spec.ts and .suziqai.json file', async () => {
      const result = await library.save(mockTest);

      expect(result.fileName).toBe('login-flow');
      expect(result.path).toBe(path.join(testOutputDir, 'login-flow.spec.ts'));

      const specContent = await readFile(path.join(testOutputDir, 'login-flow.spec.ts'), 'utf-8');
      expect(specContent).toContain("import { test, expect } from '@playwright/test'");
      expect(specContent).toContain('Login flow');

      const sidecarContent = JSON.parse(await readFile(path.join(testOutputDir, 'login-flow.suziqai.json'), 'utf-8'));
      expect(sidecarContent.id).toBe('test-1');
      expect(sidecarContent.name).toBe('Login flow');
      expect(sidecarContent.steps).toHaveLength(2);
      expect(sidecarContent.savedAt).toBeDefined();
      expect(sidecarContent.updatedAt).toBeDefined();
    });

    it('overwrites existing files when fileName is provided', async () => {
      await library.save(mockTest);
      const updated = { ...mockTest, name: 'Login flow v2' };
      const result = await library.save(updated, 'login-flow');

      expect(result.fileName).toBe('login-flow');
      const sidecar = JSON.parse(await readFile(path.join(testOutputDir, 'login-flow.suziqai.json'), 'utf-8'));
      expect(sidecar.name).toBe('Login flow v2');
    });

    it('appends numeric suffix on name collision', async () => {
      await library.save(mockTest);
      const duplicate = { ...mockTest, id: 'test-2' };
      const result = await library.save(duplicate);

      expect(result.fileName).toBe('login-flow-2');
    });
  });

  describe('list', () => {
    it('returns empty array for empty directory', async () => {
      const entries = await library.list();
      expect(entries).toEqual([]);
    });

    it('lists saved tests with sidecar metadata', async () => {
      await library.save(mockTest);
      const entries = await library.list();

      expect(entries).toHaveLength(1);
      expect(entries[0].fileName).toBe('login-flow');
      expect(entries[0].name).toBe('Login flow');
      expect(entries[0].stepCount).toBe(2);
      expect(entries[0].imported).toBe(false);
    });

    it('lists .spec.ts files without sidecars as imported', async () => {
      await writeFile(path.join(testOutputDir, 'legacy.spec.ts'), 'test code', 'utf-8');
      const entries = await library.list();

      expect(entries).toHaveLength(1);
      expect(entries[0].fileName).toBe('legacy');
      expect(entries[0].imported).toBe(true);
    });
  });

  describe('load', () => {
    it('loads a test from its sidecar file', async () => {
      await library.save(mockTest);
      const loaded = await library.load('login-flow');

      expect(loaded.id).toBe('test-1');
      expect(loaded.name).toBe('Login flow');
      expect(loaded.steps).toHaveLength(2);
    });

    it('throws when sidecar does not exist', async () => {
      await expect(library.load('nonexistent')).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('removes both .spec.ts and .suziqai.json files', async () => {
      await library.save(mockTest);
      await library.delete('login-flow');

      const entries = await library.list();
      expect(entries).toHaveLength(0);
    });

    it('does not throw if files are already gone', async () => {
      await expect(library.delete('nonexistent')).resolves.not.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/test-library.test.ts`
Expected: FAIL — `TestLibrary` module does not exist

- [ ] **Step 3: Implement TestLibrary class**

Create `src/main/test-library.ts`:

```typescript
import { readdir, readFile, writeFile, unlink, mkdir, access } from 'fs/promises';
import path from 'path';
import type { TestCase, LibraryEntry } from '../shared/types';
import { generateSpec, generateSpecFilename } from '../renderer/utils/generateSpec';

export class TestLibrary {
  constructor(private testOutputDir: string) {}

  async save(test: TestCase, fileName?: string): Promise<{ fileName: string; path: string }> {
    await mkdir(this.testOutputDir, { recursive: true });

    const resolvedName = fileName || await this.resolveFileName(test);
    const specPath = path.join(this.testOutputDir, `${resolvedName}.spec.ts`);
    const sidecarPath = path.join(this.testOutputDir, `${resolvedName}.suziqai.json`);

    // Generate spec file
    const specContent = generateSpec(test);
    await writeFile(specPath, specContent, 'utf-8');

    // Read existing sidecar for savedAt, or use now
    let savedAt: string;
    try {
      const existing = JSON.parse(await readFile(sidecarPath, 'utf-8'));
      savedAt = existing.savedAt || new Date().toISOString();
    } catch {
      savedAt = new Date().toISOString();
    }

    // Write sidecar
    const sidecar = {
      id: test.id,
      name: test.name,
      steps: test.steps,
      savedAt,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf-8');

    return { fileName: resolvedName, path: specPath };
  }

  async list(): Promise<LibraryEntry[]> {
    try {
      await access(this.testOutputDir);
    } catch {
      return [];
    }

    const files = await readdir(this.testOutputDir);
    const specFiles = files.filter(f => f.endsWith('.spec.ts'));
    const entries: LibraryEntry[] = [];

    for (const specFile of specFiles) {
      const fileName = specFile.replace('.spec.ts', '');
      const sidecarPath = path.join(this.testOutputDir, `${fileName}.suziqai.json`);

      try {
        await access(sidecarPath);
        const sidecar = JSON.parse(await readFile(sidecarPath, 'utf-8'));
        entries.push({
          fileName,
          name: sidecar.name || fileName,
          stepCount: Array.isArray(sidecar.steps) ? sidecar.steps.length : 0,
          savedAt: sidecar.savedAt || '',
          updatedAt: sidecar.updatedAt || '',
          imported: false,
        });
      } catch {
        entries.push({
          fileName,
          name: fileName,
          stepCount: 0,
          savedAt: '',
          updatedAt: '',
          imported: true,
        });
      }
    }

    return entries;
  }

  async load(fileName: string): Promise<TestCase> {
    const sidecarPath = path.join(this.testOutputDir, `${fileName}.suziqai.json`);
    const data = JSON.parse(await readFile(sidecarPath, 'utf-8'));
    return {
      id: data.id,
      name: data.name,
      steps: data.steps,
    };
  }

  async delete(fileName: string): Promise<void> {
    const specPath = path.join(this.testOutputDir, `${fileName}.spec.ts`);
    const sidecarPath = path.join(this.testOutputDir, `${fileName}.suziqai.json`);

    await unlink(specPath).catch(() => {});
    await unlink(sidecarPath).catch(() => {});
  }

  private async resolveFileName(test: TestCase): Promise<string> {
    const base = this.slugify(test.name);
    let candidate = base;
    let counter = 2;

    while (true) {
      const specPath = path.join(this.testOutputDir, `${candidate}.spec.ts`);
      try {
        await access(specPath);
        candidate = `${base}-${counter}`;
        counter++;
      } catch {
        return candidate;
      }
    }
  }

  private slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  }
}
```

**Note:** The `generateSpec` import from `src/renderer/utils/generateSpec` is a pure function with no DOM dependencies, so it can be used from the main process. If the build complains about the import path, move `generateSpec.ts` to `src/shared/utils/generateSpec.ts` and update both import sites.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/test-library.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/test-library.ts tests/main/test-library.test.ts
git commit -m "feat(library): implement TestLibrary with save/load/list/delete"
```

---

### Task 3: Wire up IPC handlers for the library

**Files:**
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/main/library-ipc.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockList = vi.fn();
const mockSave = vi.fn();
const mockLoad = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../src/main/test-library', () => ({
  TestLibrary: vi.fn().mockImplementation(() => ({
    list: mockList,
    save: mockSave,
    load: mockLoad,
    delete: mockDelete,
  })),
}));

const handlers = new Map<string, Function>();
const mockHandle = vi.fn((channel: string, handler: Function) => {
  handlers.set(channel, handler);
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockHandle,
    on: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

import { IPC } from '../../src/shared/types';

describe('Library IPC handlers', () => {
  beforeEach(() => {
    handlers.clear();
    mockHandle.mockClear();
    mockList.mockReset();
    mockSave.mockReset();
    mockLoad.mockReset();
    mockDelete.mockReset();
  });

  it('registers library:list handler that calls testLibrary.list()', async () => {
    // We need to dynamically import after mocks are set up
    const { registerIpcHandlers } = await import('../../src/main/ipc-handlers');

    const deps = {
      browserManager: {} as any,
      claudeSession: {} as any,
      recorder: {} as any,
      observer: {} as any,
      testExporter: {} as any,
      testLibrary: { list: mockList, save: mockSave, load: mockLoad, delete: mockDelete } as any,
      getWindow: () => null,
    };

    registerIpcHandlers(deps);

    const listHandler = handlers.get(IPC.LIBRARY_LIST);
    expect(listHandler).toBeDefined();

    mockList.mockResolvedValue([{ fileName: 'test', name: 'Test', stepCount: 1, savedAt: '', updatedAt: '', imported: false }]);
    const result = await listHandler!({}, undefined);
    expect(mockList).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/library-ipc.test.ts`
Expected: FAIL — `testLibrary` is not in the `Deps` interface

- [ ] **Step 3: Add library IPC handlers**

In `src/main/ipc-handlers.ts`:

1. Add the import at the top:
```typescript
import type { TestLibrary } from './test-library';
```

2. Add `testLibrary` to the `Deps` interface:
```typescript
interface Deps {
  browserManager: BrowserManager;
  claudeSession: ClaudeSession;
  recorder: Recorder;
  observer: Observer;
  testExporter: TestExporter;
  testLibrary: TestLibrary;
  getWindow: () => BrowserWindow | null;
}
```

3. Destructure it in `registerIpcHandlers`:
```typescript
const { browserManager, claudeSession, recorder, observer, testExporter, testLibrary, getWindow } = deps;
```

4. Add the four handlers at the end of `registerIpcHandlers`, before the closing brace:
```typescript
  // Library
  ipcMain.handle(IPC.LIBRARY_LIST, async () => {
    return testLibrary.list();
  });

  ipcMain.handle(IPC.LIBRARY_SAVE, async (_event, test: any, fileName?: string) => {
    return testLibrary.save(test, fileName);
  });

  ipcMain.handle(IPC.LIBRARY_LOAD, async (_event, fileName: string) => {
    return testLibrary.load(fileName);
  });

  ipcMain.handle(IPC.LIBRARY_DELETE, async (_event, fileName: string) => {
    return testLibrary.delete(fileName);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/library-ipc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts tests/main/library-ipc.test.ts
git commit -m "feat(library): register library IPC handlers"
```

---

### Task 4: Wire TestLibrary into main.ts

**Files:**
- Modify: `src/main/main.ts`

- [ ] **Step 1: Read main.ts to find where deps are created**

Read `src/main/main.ts` and find where `registerIpcHandlers` is called with its deps object.

- [ ] **Step 2: Add TestLibrary instantiation**

1. Add the import near the top with other imports:
```typescript
import { TestLibrary } from './test-library';
```

2. Where other deps are instantiated (near where `TestExporter` is created), add:
```typescript
const testLibrary = new TestLibrary(
  path.join(projectConfigManager.getProjectPath(), projectConfigManager.getConfig().testOutputDir)
);
```

3. Add `testLibrary` to the deps object passed to `registerIpcHandlers`.

**Important:** The `TestLibrary` needs the resolved `testOutputDir` path. Since the project path isn't known until `project:open` is called, you may need to create `TestLibrary` lazily — inside the `PROJECT_OPEN` handler or after the project config is loaded. Check the existing flow in `main.ts` and follow the same pattern used for other deps that depend on the project path.

If `testLibrary` needs to be recreated on project open, make the deps property mutable or create it with a getter pattern.

- [ ] **Step 3: Verify the app builds**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Commit**

```bash
git add src/main/main.ts
git commit -m "feat(library): wire TestLibrary into main process"
```

---

### Task 5: Expose library methods in preload

**Files:**
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/types.ts`

- [ ] **Step 1: Add library IPC channels to preload.ts**

In `src/preload/preload.ts`, add to the `IPC` const object (the inlined copy):

```typescript
  LIBRARY_LIST: 'library:list',
  LIBRARY_SAVE: 'library:save',
  LIBRARY_LOAD: 'library:load',
  LIBRARY_DELETE: 'library:delete',
```

Then add to the `contextBridge.exposeInMainWorld('suziqai', { ... })` object:

```typescript
  // Library
  listLibrary: () => ipcRenderer.invoke(IPC.LIBRARY_LIST),
  saveToLibrary: (test: any, fileName?: string) => ipcRenderer.invoke(IPC.LIBRARY_SAVE, test, fileName),
  loadFromLibrary: (fileName: string) => ipcRenderer.invoke(IPC.LIBRARY_LOAD, fileName),
  deleteFromLibrary: (fileName: string) => ipcRenderer.invoke(IPC.LIBRARY_DELETE, fileName),
```

- [ ] **Step 2: Add library methods to SuziQaiAPI type**

In `src/renderer/types.ts`, add to the `SuziQaiAPI` interface:

```typescript
  listLibrary: () => Promise<import('@shared/types').LibraryEntry[]>;
  saveToLibrary: (test: import('@shared/types').TestCase, fileName?: string) => Promise<{ fileName: string; path: string }>;
  loadFromLibrary: (fileName: string) => Promise<import('@shared/types').TestCase>;
  deleteFromLibrary: (fileName: string) => Promise<void>;
```

- [ ] **Step 3: Verify the app builds**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/preload/preload.ts src/renderer/types.ts
git commit -m "feat(library): expose library IPC methods in preload bridge"
```

---

### Task 6: Create LibraryView component

**Files:**
- Create: `src/renderer/components/LibraryView.tsx`
- Test: `tests/renderer/LibraryView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/LibraryView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibraryView } from '../../src/renderer/components/LibraryView';
import type { LibraryEntry } from '../../src/shared/types';

describe('LibraryView', () => {
  const mockEntries: LibraryEntry[] = [
    { fileName: 'login-flow', name: 'Login flow', stepCount: 3, savedAt: '2026-03-27T10:00:00Z', updatedAt: '2026-03-27T10:00:00Z', imported: false },
    { fileName: 'legacy-test', name: 'legacy-test', stepCount: 0, savedAt: '', updatedAt: '', imported: true },
  ];

  it('renders a list of saved tests', () => {
    render(<LibraryView entries={mockEntries} onLoad={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText('Login flow')).toBeDefined();
    expect(screen.getByText('legacy-test')).toBeDefined();
  });

  it('shows step count for entries with sidecars', () => {
    render(<LibraryView entries={mockEntries} onLoad={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText('3 steps')).toBeDefined();
  });

  it('shows imported badge for tests without sidecars', () => {
    render(<LibraryView entries={mockEntries} onLoad={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText('imported')).toBeDefined();
  });

  it('calls onLoad when clicking a test entry', () => {
    const onLoad = vi.fn();
    render(<LibraryView entries={mockEntries} onLoad={onLoad} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByText('Login flow'));
    expect(onLoad).toHaveBeenCalledWith('login-flow');
  });

  it('calls onDelete when clicking delete button', () => {
    const onDelete = vi.fn();
    render(<LibraryView entries={mockEntries} onLoad={vi.fn()} onDelete={onDelete} onRefresh={vi.fn()} />);
    const deleteButtons = screen.getAllByText('×');
    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith('login-flow');
  });

  it('shows empty state when no entries', () => {
    render(<LibraryView entries={[]} onLoad={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText(/no saved tests/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/LibraryView.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement LibraryView component**

Create `src/renderer/components/LibraryView.tsx`:

```tsx
import React from 'react';
import type { LibraryEntry } from '@shared/types';

interface LibraryViewProps {
  entries: LibraryEntry[];
  onLoad: (fileName: string) => void;
  onDelete: (fileName: string) => void;
  onRefresh: () => void;
}

export function LibraryView({ entries, onLoad, onDelete, onRefresh }: LibraryViewProps) {
  if (entries.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 40, padding: '0 10px' }}>
        No saved tests yet. Save a test from the session to see it here.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {entries.map(entry => (
        <div
          key={entry.fileName}
          onClick={() => !entry.imported && onLoad(entry.fileName)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderRadius: 3,
            background: 'var(--bg-tertiary)',
            cursor: entry.imported ? 'default' : 'pointer',
            opacity: entry.imported ? 0.7 : 1,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.name}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1, display: 'flex', gap: 6 }}>
              {entry.imported ? (
                <span style={{ color: 'var(--accent-yellow, #d29922)', fontWeight: 500 }}>imported</span>
              ) : (
                <>
                  <span>{entry.stepCount} steps</span>
                  {entry.updatedAt && (
                    <span>{new Date(entry.updatedAt).toLocaleDateString()}</span>
                  )}
                </>
              )}
            </div>
          </div>
          {!entry.imported && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(entry.fileName); }}
              style={{
                background: 'none',
                color: 'var(--text-muted)',
                fontSize: 11,
                padding: '0 2px',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/LibraryView.test.tsx`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/LibraryView.tsx tests/renderer/LibraryView.test.tsx
git commit -m "feat(library): add LibraryView component"
```

---

### Task 7: Add Session/Library toggle and Save button to StepSidebar

**Files:**
- Modify: `src/renderer/components/StepSidebar.tsx`
- Modify: `tests/renderer/StepSidebar.test.tsx`

- [ ] **Step 1: Write failing tests for the new sidebar behavior**

Add to `tests/renderer/StepSidebar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepSidebar } from '../../src/renderer/components/StepSidebar';

// Add these tests to the existing describe block, or create a new describe('Library toggle')

describe('Library toggle', () => {
  const baseProps = {
    tests: [{ id: '1', name: 'Test 1', steps: [] }],
    activeTestId: '1',
    onSwitchTest: vi.fn(),
    onCreateTest: vi.fn(),
    onRenameTest: vi.fn(),
    onDeleteTest: vi.fn(),
    onAcceptStep: vi.fn(),
    onDenyStep: vi.fn(),
    onResetStep: vi.fn(),
    onUpdateStep: vi.fn(),
    onInsertStep: vi.fn(),
    onInsertPrompt: vi.fn(),
    onRunAll: vi.fn(),
    onExport: vi.fn(),
    sidebarMode: 'session' as const,
    onSidebarModeChange: vi.fn(),
    onSaveTest: vi.fn(),
    libraryEntries: [],
    onLoadFromLibrary: vi.fn(),
    onDeleteFromLibrary: vi.fn(),
    onRefreshLibrary: vi.fn(),
  };

  it('renders Session and Library tabs', () => {
    render(<StepSidebar {...baseProps} />);
    expect(screen.getByText('Session')).toBeDefined();
    expect(screen.getByText('Library')).toBeDefined();
  });

  it('calls onSidebarModeChange when clicking Library tab', () => {
    render(<StepSidebar {...baseProps} />);
    fireEvent.click(screen.getByText('Library'));
    expect(baseProps.onSidebarModeChange).toHaveBeenCalledWith('library');
  });

  it('shows library view when sidebarMode is library', () => {
    render(<StepSidebar {...baseProps} sidebarMode="library" />);
    expect(screen.getByText(/no saved tests/i)).toBeDefined();
  });

  it('renders Save button in session mode', () => {
    render(<StepSidebar {...baseProps} />);
    expect(screen.getByText('Save')).toBeDefined();
  });

  it('calls onSaveTest when clicking Save', () => {
    render(<StepSidebar {...baseProps} />);
    fireEvent.click(screen.getByText('Save'));
    expect(baseProps.onSaveTest).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/StepSidebar.test.tsx`
Expected: FAIL — StepSidebar doesn't accept the new props

- [ ] **Step 3: Update StepSidebar with toggle and Save button**

Modify `src/renderer/components/StepSidebar.tsx`:

1. Add import at top:
```tsx
import { LibraryView } from './LibraryView';
import type { LibraryEntry } from '@shared/types';
```

2. Update the `StepSidebarProps` interface — add these new props:
```typescript
  sidebarMode: 'session' | 'library';
  onSidebarModeChange: (mode: 'session' | 'library') => void;
  onSaveTest: () => void;
  libraryEntries: LibraryEntry[];
  onLoadFromLibrary: (fileName: string) => void;
  onDeleteFromLibrary: (fileName: string) => void;
  onRefreshLibrary: () => void;
```

3. Destructure the new props in the component function.

4. Add the Session/Library tab bar at the very top of the returned JSX (before the test tabs section):
```tsx
{/* Session / Library toggle */}
<div style={{ display: 'flex', marginBottom: 8 }}>
  {(['session', 'library'] as const).map(tab => (
    <button
      key={tab}
      onClick={() => onSidebarModeChange(tab)}
      style={{
        flex: 1,
        padding: '4px 0',
        fontSize: 11,
        fontWeight: sidebarMode === tab ? 'bold' : 'normal',
        color: sidebarMode === tab ? 'var(--text-primary)' : 'var(--text-muted)',
        background: sidebarMode === tab ? 'var(--bg-tertiary)' : 'transparent',
        borderBottom: sidebarMode === tab ? '2px solid var(--accent-green)' : '2px solid transparent',
        cursor: 'pointer',
        textTransform: 'capitalize',
      }}
    >
      {tab === 'session' ? 'Session' : 'Library'}
    </button>
  ))}
</div>
```

5. Wrap all the existing content (test tabs, step list, bottom buttons) in a conditional:
```tsx
{sidebarMode === 'session' ? (
  <>
    {/* ... all existing session content ... */}
  </>
) : (
  <LibraryView
    entries={libraryEntries}
    onLoad={onLoadFromLibrary}
    onDelete={onDeleteFromLibrary}
    onRefresh={onRefreshLibrary}
  />
)}
```

6. Add a Save button next to the Export button in the bottom bar (session mode only):
```tsx
<div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
  <button onClick={onRunAll} style={{ /* existing Run All styles */ }}>
    Run All
  </button>
  <button onClick={onSaveTest} style={{
    flex: 1,
    background: 'var(--accent-blue, #0969da)',
    color: '#ffffff',
    borderRadius: 4,
    padding: 6,
    fontSize: 11,
    fontWeight: 'bold',
  }}>
    Save
  </button>
  <button onClick={onExport} style={{ /* existing Export styles */ }}>
    Export .spec.ts
  </button>
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/StepSidebar.test.tsx`
Expected: All tests PASS (both existing and new)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/StepSidebar.tsx tests/renderer/StepSidebar.test.tsx
git commit -m "feat(library): add Session/Library toggle and Save button to sidebar"
```

---

### Task 8: Integrate library into App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add library state and handlers to App.tsx**

1. Add import at top:
```tsx
import type { LibraryEntry } from '@shared/types';
```

2. Add state variables after the existing state declarations:
```tsx
const [sidebarMode, setSidebarMode] = useState<'session' | 'library'>('session');
const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
```

3. Add a `refreshLibrary` function:
```tsx
const refreshLibrary = async () => {
  const entries = await window.suziqai.listLibrary();
  setLibraryEntries(entries);
};
```

4. Add a `saveTest` function:
```tsx
const saveTest = async () => {
  const test = tests.find(t => t.id === activeTestId);
  if (!test) return;
  try {
    const result = await window.suziqai.saveToLibrary(test);
    log(`Saved "${test.name}" → ${result.fileName}.spec.ts`);
  } catch (err) {
    log(`Save failed: ${(err as Error).message}`);
  }
};
```

5. Add a `loadFromLibrary` function:
```tsx
const loadFromLibrary = async (fileName: string) => {
  try {
    const loaded = await window.suziqai.loadFromLibrary(fileName);
    // Add as a new test tab with a fresh ID so it doesn't collide with existing session tests
    const newTest: TestCase = {
      ...loaded,
      id: `test-${Date.now()}`,
    };
    setTests(prev => [...prev, newTest]);
    setActiveTestId(newTest.id);
    setSidebarMode('session');
    log(`Loaded "${loaded.name}" from library`);
  } catch (err) {
    log(`Load failed: ${(err as Error).message}`);
  }
};
```

6. Add a `deleteFromLibrary` function:
```tsx
const deleteFromLibrary = async (fileName: string) => {
  try {
    await window.suziqai.deleteFromLibrary(fileName);
    await refreshLibrary();
    log(`Deleted "${fileName}" from library`);
  } catch (err) {
    log(`Delete failed: ${(err as Error).message}`);
  }
};
```

7. Refresh the library when switching to library mode — add a useEffect:
```tsx
useEffect(() => {
  if (sidebarMode === 'library') {
    refreshLibrary();
  }
}, [sidebarMode]);
```

8. Pass new props to `<StepSidebar>`:
```tsx
<StepSidebar
  /* ...all existing props... */
  sidebarMode={sidebarMode}
  onSidebarModeChange={setSidebarMode}
  onSaveTest={saveTest}
  libraryEntries={libraryEntries}
  onLoadFromLibrary={loadFromLibrary}
  onDeleteFromLibrary={deleteFromLibrary}
  onRefreshLibrary={refreshLibrary}
/>
```

- [ ] **Step 2: Verify the app builds**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(library): integrate library state and handlers into App"
```

---

### Task 9: Verify end-to-end and run full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Build the app**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Manually verify (if running the dev server)**

Run: `npm run dev` (if applicable)

Check:
- Sidebar shows Session/Library tabs
- Library tab shows "No saved tests" initially
- Create a test with steps, click Save
- Switch to Library tab — saved test appears
- Click the saved test — it loads into a new session tab
- Delete from library — it disappears

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(library): address integration issues from end-to-end testing"
```
