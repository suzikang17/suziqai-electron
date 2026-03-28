# Test Suite Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve TestCase into TestSuite with beforeEach hooks and multiple named test blocks, generating well-structured Playwright spec files.

**Architecture:** Add `TestBlock` and `TestSuite` types that replace `TestCase`. Update `generateSpec` to emit describe/beforeEach/test structure. Update App.tsx state, StepSidebar UI, and TestLibrary to use the new types. Auto-migrate old session data.

**Tech Stack:** TypeScript, React, Vitest, Electron IPC

---

### Task 1: Add TestBlock and TestSuite types

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `tests/shared/types.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/shared/types.test.ts`:

```typescript
import type { TestBlock, TestSuite } from '../../src/shared/types';

describe('TestSuite types', () => {
  it('TestBlock type is usable', () => {
    const block: TestBlock = {
      id: 'block-1',
      name: 'valid login',
      steps: [],
    };
    expect(block.name).toBe('valid login');
  });

  it('TestSuite type is usable', () => {
    const suite: TestSuite = {
      id: 'suite-1',
      name: 'Login Feature',
      beforeEach: [],
      tests: [{ id: 'block-1', name: 'valid login', steps: [] }],
    };
    expect(suite.name).toBe('Login Feature');
    expect(suite.tests).toHaveLength(1);
    expect(suite.beforeEach).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/types.test.ts`
Expected: FAIL — `TestBlock` and `TestSuite` not exported

- [ ] **Step 3: Add the types**

In `src/shared/types.ts`, add after the existing `TestCase` interface (keep `TestCase` for now — it's still used and will be removed in a later task):

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts tests/shared/types.test.ts
git commit -m "feat(types): add TestBlock and TestSuite types"
```

---

### Task 2: Add migration helper (TestCase → TestSuite)

**Files:**
- Create: `src/shared/utils/migrateSuite.ts`
- Create: `tests/shared/migrateSuite.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/migrateSuite.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { migrateToSuite } from '../../src/shared/utils/migrateSuite';
import type { TestCase, TestSuite } from '../../src/shared/types';

describe('migrateToSuite', () => {
  it('converts a TestCase to a TestSuite with one TestBlock', () => {
    const testCase: TestCase = {
      id: 'test-1',
      name: 'Login flow',
      steps: [
        { id: 's1', label: 'Navigate', action: { type: 'navigate', url: '/login' }, status: 'passed' },
        { id: 's2', label: 'Click', action: { type: 'click', selector: 'button' }, status: 'pending' },
      ],
    };

    const suite = migrateToSuite(testCase);

    expect(suite.id).toBe('test-1');
    expect(suite.name).toBe('Login flow');
    expect(suite.beforeEach).toEqual([]);
    expect(suite.tests).toHaveLength(1);
    expect(suite.tests[0].name).toBe('Login flow');
    expect(suite.tests[0].steps).toHaveLength(2);
    expect(suite.tests[0].steps[0].id).toBe('s1');
  });

  it('passes through a TestSuite unchanged', () => {
    const suite: TestSuite = {
      id: 'suite-1',
      name: 'My Suite',
      beforeEach: [],
      tests: [{ id: 'b1', name: 'test 1', steps: [] }],
    };

    const result = migrateToSuite(suite as any);

    expect(result.id).toBe('suite-1');
    expect(result.tests).toHaveLength(1);
    expect(result.beforeEach).toEqual([]);
  });

  it('detects old format by presence of steps array and absence of tests array', () => {
    const oldFormat = { id: '1', name: 'Old', steps: [] };
    const result = migrateToSuite(oldFormat as any);
    expect(result.tests).toBeDefined();
    expect(result.beforeEach).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/migrateSuite.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement migration helper**

Create `src/shared/utils/migrateSuite.ts`:

```typescript
import type { TestSuite } from '../types';

/**
 * Converts a TestCase (old format) or TestSuite (new format) into a TestSuite.
 * Detection: old format has `steps` array, new format has `tests` array.
 */
export function migrateToSuite(data: any): TestSuite {
  // Already new format
  if (Array.isArray(data.tests)) {
    return {
      id: data.id,
      name: data.name,
      beforeEach: data.beforeEach || [],
      tests: data.tests,
    };
  }

  // Old TestCase format: has steps array
  return {
    id: data.id,
    name: data.name,
    beforeEach: [],
    tests: [{
      id: `block-${data.id}`,
      name: data.name,
      steps: data.steps || [],
    }],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/migrateSuite.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/utils/migrateSuite.ts tests/shared/migrateSuite.test.ts
git commit -m "feat(migration): add TestCase to TestSuite migration helper"
```

---

### Task 3: Rewrite generateSpec for TestSuite

**Files:**
- Modify: `src/shared/utils/generateSpec.ts`
- Modify: `tests/` (find or create generateSpec test)

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/generateSpec.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generateSpec, generateSpecFilename } from '../../src/shared/utils/generateSpec';
import type { TestSuite } from '../../src/shared/types';

describe('generateSpec', () => {
  it('generates a spec with describe, beforeEach, and multiple tests', () => {
    const suite: TestSuite = {
      id: 'suite-1',
      name: 'Login Feature',
      beforeEach: [
        { id: 's0', label: 'Navigate', action: { type: 'navigate', url: '/login' }, status: 'passed' },
      ],
      tests: [
        {
          id: 'b1',
          name: 'valid login',
          steps: [
            { id: 's1', label: 'Fill email', action: { type: 'fill', selector: "getByLabel('Email')", value: 'test@test.com' }, status: 'passed' },
            { id: 's2', label: 'Click submit', action: { type: 'click', selector: "getByRole('button', { name: 'Sign In' })" }, status: 'passed' },
            { id: 's3', label: 'Assert URL', action: { type: 'assert', assertionType: 'url', expected: '/dashboard' }, status: 'passed' },
          ],
        },
        {
          id: 'b2',
          name: 'invalid login',
          steps: [
            { id: 's4', label: 'Fill bad email', action: { type: 'fill', selector: "getByLabel('Email')", value: 'bad@test.com' }, status: 'passed' },
            { id: 's5', label: 'Assert error', action: { type: 'assert', assertionType: 'visible', expected: '', selector: "getByText('Invalid')" }, status: 'passed' },
          ],
        },
      ],
    };

    const code = generateSpec(suite);

    expect(code).toContain("import { test, expect } from '@playwright/test'");
    expect(code).toContain("test.describe('Login Feature'");
    expect(code).toContain("test.beforeEach(async ({ page })");
    expect(code).toContain("await page.goto('/login')");
    expect(code).toContain("test('valid login'");
    expect(code).toContain("test('invalid login'");
    expect(code).toContain("await page.getByLabel('Email').fill('test@test.com')");
    expect(code).toContain("await expect(page).toHaveURL('/dashboard')");
  });

  it('omits beforeEach block when empty', () => {
    const suite: TestSuite = {
      id: 'suite-1',
      name: 'Simple',
      beforeEach: [],
      tests: [{
        id: 'b1',
        name: 'only test',
        steps: [
          { id: 's1', label: 'Navigate', action: { type: 'navigate', url: '/' }, status: 'passed' },
        ],
      }],
    };

    const code = generateSpec(suite);

    expect(code).not.toContain('beforeEach');
    expect(code).toContain("test.describe('Simple'");
    expect(code).toContain("test('only test'");
  });

  it('skips failed steps', () => {
    const suite: TestSuite = {
      id: 'suite-1',
      name: 'Test',
      beforeEach: [],
      tests: [{
        id: 'b1',
        name: 'test block',
        steps: [
          { id: 's1', label: 'Good', action: { type: 'navigate', url: '/' }, status: 'passed' },
          { id: 's2', label: 'Bad', action: { type: 'click', selector: 'missing' }, status: 'failed' },
        ],
      }],
    };

    const code = generateSpec(suite);

    expect(code).toContain("await page.goto('/')");
    expect(code).not.toContain('missing');
  });
});

describe('generateSpecFilename', () => {
  it('generates a slug from suite name', () => {
    const suite: TestSuite = {
      id: '1',
      name: 'Login Feature',
      beforeEach: [],
      tests: [],
    };
    expect(generateSpecFilename(suite)).toBe('login-feature.spec.ts');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/generateSpec.test.ts`
Expected: FAIL — `generateSpec` still expects `TestCase`

- [ ] **Step 3: Rewrite generateSpec**

Replace the contents of `src/shared/utils/generateSpec.ts`:

```typescript
import type { TestSuite, StepAction } from '@shared/types';

function actionToPlaywright(action: StepAction): string {
  switch (action.type) {
    case 'navigate':
      return `await page.goto('${action.url}');`;
    case 'click': {
      const sel = selectorToPlaywright(action.selector);
      return `await ${sel}.click();`;
    }
    case 'fill': {
      const sel = selectorToPlaywright(action.selector);
      return `await ${sel}.fill('${action.value.replace(/'/g, "\\'")}');`;
    }
    case 'assert': {
      switch (action.assertionType) {
        case 'url':
          return `await expect(page).toHaveURL('${action.expected}');`;
        case 'visible': {
          const sel = selectorToPlaywright(action.selector || '');
          return `await expect(${sel}).toBeVisible();`;
        }
        case 'text': {
          if (action.selector) {
            const sel = selectorToPlaywright(action.selector);
            return `await expect(${sel}).toContainText('${action.expected}');`;
          }
          return `await expect(page.locator('body')).toContainText('${action.expected}');`;
        }
        case 'hidden': {
          const sel = selectorToPlaywright(action.selector || '');
          return `await expect(${sel}).toBeHidden();`;
        }
        case 'value': {
          const sel = selectorToPlaywright(action.selector || '');
          return `await expect(${sel}).toHaveValue('${action.expected}');`;
        }
        default:
          return `// Unknown assertion type: ${(action as any).assertionType}`;
      }
    }
    case 'waitFor': {
      const sel = selectorToPlaywright(action.selector);
      return `await ${sel}.waitFor();`;
    }
    case 'screenshot':
      return `await page.screenshot();`;
    default:
      return `// Unknown action`;
  }
}

function selectorToPlaywright(selector: string): string {
  if (/^getBy(Text|Role|Label|TestId|Placeholder)\(/.test(selector)) {
    return `page.${selector}`;
  }
  return `page.locator('${selector.replace(/'/g, "\\'")}')`;
}

function stepsToCode(steps: Array<{ action: StepAction; status: string }>, indent: string): string {
  return steps
    .filter(s => s.status !== 'failed')
    .map(s => `${indent}${actionToPlaywright(s.action)}`)
    .join('\n');
}

export function generateSpec(suite: TestSuite): string {
  const suiteName = suite.name.replace(/'/g, "\\'");
  let code = `import { test, expect } from '@playwright/test';\n\n`;

  code += `test.describe('${suiteName}', () => {\n`;

  // beforeEach
  if (suite.beforeEach.length > 0) {
    code += `  test.beforeEach(async ({ page }) => {\n`;
    code += stepsToCode(suite.beforeEach, '    ');
    code += `\n  });\n\n`;
  }

  // test blocks
  suite.tests.forEach((block, i) => {
    const blockName = block.name.replace(/'/g, "\\'");
    code += `  test('${blockName}', async ({ page }) => {\n`;
    const stepCode = stepsToCode(block.steps, '    ');
    code += stepCode || '    // No steps yet';
    code += `\n  });\n`;
    if (i < suite.tests.length - 1) code += '\n';
  });

  code += `});\n`;

  return code;
}

export function generateSpecFilename(suite: TestSuite): string {
  const slug = suite.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  return `${slug}.spec.ts`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/generateSpec.test.ts`
Expected: PASS

- [ ] **Step 5: Fix any other tests that import generateSpec with old signature**

Run: `npx vitest run`

If `tests/main/test-library.test.ts` fails because `TestLibrary.save` still passes `TestCase` to `generateSpec`, that's expected — it will be fixed in Task 4. For now just ensure the new tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/utils/generateSpec.ts tests/shared/generateSpec.test.ts
git commit -m "feat(codegen): rewrite generateSpec for TestSuite with describe/beforeEach/test"
```

---

### Task 4: Update TestLibrary to use TestSuite

**Files:**
- Modify: `src/main/test-library.ts`
- Modify: `tests/main/test-library.test.ts`

- [ ] **Step 1: Update the test file**

In `tests/main/test-library.test.ts`, change all `TestCase` references to `TestSuite`:

1. Change the import: `import type { TestSuite } from '../../src/shared/types';`
2. Replace `mockTest` with:

```typescript
const mockSuite: TestSuite = {
  id: 'suite-1',
  name: 'Login flow',
  beforeEach: [
    { id: 's0', label: 'Navigate to /login', action: { type: 'navigate', url: '/login' }, status: 'passed' },
  ],
  tests: [{
    id: 'block-1',
    name: 'valid login',
    steps: [
      { id: 's1', label: 'Click sign in', action: { type: 'click', selector: "getByRole('button', { name: 'Sign In' })" }, status: 'passed' },
    ],
  }],
};
```

3. Update all `mockTest` references to `mockSuite`
4. Update assertions:
   - `sidecarContent.steps` → `sidecarContent.tests` (array of test blocks)
   - `sidecarContent.beforeEach` should exist
   - `stepCount` should count all steps: beforeEach + all test block steps (2 in this case)
   - `loaded.tests` instead of `loaded.steps`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/test-library.test.ts`
Expected: FAIL — TestLibrary still uses TestCase

- [ ] **Step 3: Update TestLibrary**

In `src/main/test-library.ts`:

1. Change imports: `import type { TestSuite, LibraryEntry } from '../shared/types';`
2. Change `save` signature: `async save(suite: TestSuite, fileName?: string)`
3. Update `save` to write suite structure to sidecar:
```typescript
const sidecar = {
  id: suite.id,
  name: suite.name,
  beforeEach: suite.beforeEach,
  tests: suite.tests,
  savedAt,
  updatedAt: new Date().toISOString(),
};
```
4. Update `list` to count steps correctly:
```typescript
const beforeEachCount = Array.isArray(sidecar.beforeEach) ? sidecar.beforeEach.length : 0;
const testStepCount = Array.isArray(sidecar.tests)
  ? sidecar.tests.reduce((sum: number, t: any) => sum + (Array.isArray(t.steps) ? t.steps.length : 0), 0)
  : 0;
// ...
stepCount: beforeEachCount + testStepCount,
```
5. Update `load` to return `TestSuite`:
```typescript
async load(fileName: string): Promise<TestSuite> {
  const sidecarPath = path.join(this.testOutputDir, `${fileName}.suziqai.json`);
  const data = JSON.parse(await readFile(sidecarPath, 'utf-8'));
  return {
    id: data.id,
    name: data.name,
    beforeEach: data.beforeEach || [],
    tests: data.tests || [],
  };
}
```
6. Update `resolveFileName` to accept `TestSuite`:
```typescript
private async resolveFileName(suite: TestSuite): Promise<string> {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/test-library.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Fix any remaining breakages from the type change.

- [ ] **Step 6: Commit**

```bash
git add src/main/test-library.ts tests/main/test-library.test.ts
git commit -m "feat(library): update TestLibrary to use TestSuite"
```

---

### Task 5: Update App.tsx state management for TestSuite

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/types.ts`

- [ ] **Step 1: Read App.tsx to understand current state**

Read `src/renderer/App.tsx` in full to understand all places where `TestCase`, `tests`, `activeTestId`, steps, and related state/handlers are used.

- [ ] **Step 2: Update imports and state**

1. Add imports:
```typescript
import type { Step, TestSuite, TestBlock, ChatMessage, AppMode, LibraryEntry } from '@shared/types';
import { migrateToSuite } from '@shared/utils/migrateSuite';
```

2. Replace `TestCase` state with `TestSuite`:
```typescript
const [suites, setSuites] = useState<TestSuite[]>([{
  id: '1',
  name: 'Untitled Test',
  beforeEach: [],
  tests: [{ id: 'block-1', name: 'Untitled Test', steps: [] }],
}]);
const [activeSuiteId, setActiveSuiteId] = useState<string>('1');
const [activeBlockId, setActiveBlockId] = useState<string>('block-1');
```

3. Derive current suite and block:
```typescript
const currentSuite = suites.find(s => s.id === activeSuiteId) || suites[0];
const currentBlock = currentSuite.tests.find(b => b.id === activeBlockId) || currentSuite.tests[0];
```

- [ ] **Step 3: Update handlers**

Update all existing handlers to work with `suites`/`TestSuite` instead of `tests`/`TestCase`. Key changes:

- `createNewTest` → `createNewSuite` (creates a new TestSuite with one empty TestBlock)
- Add `createNewBlock` (adds a TestBlock to the active suite)
- `renameTest` → `renameSuite` + `renameBlock`
- `deleteTest` → `deleteSuite` + `deleteBlock`
- `updateCurrentTest` → update steps in the active block within the active suite
- Step-related handlers (accept, deny, reset, update, insert) operate on `currentBlock.steps`
- `onStepsProposed` listener adds steps to `activeBlockId`'s steps array
- Session save/load uses `suites` and migrates old data via `migrateToSuite`

- [ ] **Step 4: Update session persistence**

Load session with migration:
```typescript
useEffect(() => {
  if (!projectPath) return;
  window.suziqai.loadSession().then((data) => {
    if (data) {
      if (data.messages) setMessages(data.messages);
      if (data.suites) {
        setSuites(data.suites);
        setActiveSuiteId(data.activeSuiteId || data.suites[0]?.id || '1');
        setActiveBlockId(data.activeBlockId || data.suites[0]?.tests[0]?.id || 'block-1');
      } else if (data.tests) {
        // Migrate old TestCase[] format
        const migrated = data.tests.map((t: any) => migrateToSuite(t));
        setSuites(migrated);
        setActiveSuiteId(data.activeTestId || migrated[0]?.id || '1');
        setActiveBlockId(migrated[0]?.tests[0]?.id || 'block-1');
      }
    }
  });
}, [projectPath]);
```

Save session:
```typescript
window.suziqai.saveSession({
  messages,
  suites,
  activeSuiteId,
  activeBlockId,
});
```

- [ ] **Step 5: Update library handlers**

```typescript
const saveTest = async () => {
  const suite = suites.find(s => s.id === activeSuiteId);
  if (!suite) return;
  try {
    const result = await window.suziqai.saveToLibrary(suite);
    log(`Saved "${suite.name}" → ${result.fileName}.spec.ts`);
  } catch (err) {
    log(`Save failed: ${(err as Error).message}`);
  }
};

const loadFromLibrary = async (fileName: string) => {
  try {
    const loaded = await window.suziqai.loadFromLibrary(fileName);
    const newSuite: TestSuite = {
      ...loaded,
      id: `suite-${Date.now()}`,
    };
    setSuites(prev => [...prev, newSuite]);
    setActiveSuiteId(newSuite.id);
    setActiveBlockId(newSuite.tests[0]?.id || '');
    setSidebarMode('session');
    log(`Loaded "${loaded.name}" from library`);
  } catch (err) {
    log(`Load failed: ${(err as Error).message}`);
  }
};
```

- [ ] **Step 6: Update StepSidebar props**

Pass the new suite-aware props to StepSidebar. The prop interface will change in Task 6, but for now update what's passed to keep the build working. Key: pass `currentSuite`, `currentBlock`, and the new handlers.

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: Build succeeds (some tests may fail until StepSidebar is updated)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(app): migrate App.tsx state from TestCase to TestSuite"
```

---

### Task 6: Update StepSidebar for suite structure

**Files:**
- Modify: `src/renderer/components/StepSidebar.tsx`
- Modify: `tests/renderer/StepSidebar.test.tsx`

- [ ] **Step 1: Read current StepSidebar.tsx**

Read the full file to understand the current structure, including the step grouping logic, drag-to-reorder, and collapsible assertions.

- [ ] **Step 2: Update StepSidebarProps**

Replace test-related props with suite-aware ones:

```typescript
interface StepSidebarProps {
  suites: TestSuite[];
  activeSuiteId: string;
  activeBlockId: string;
  onSwitchSuite: (suiteId: string) => void;
  onSwitchBlock: (blockId: string) => void;
  onCreateSuite: () => void;
  onCreateBlock: () => void;
  onRenameSuite: (suiteId: string, name: string) => void;
  onRenameBlock: (blockId: string, name: string) => void;
  onDeleteSuite: (suiteId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onAcceptStep: (stepId: string) => void;
  onDenyStep: (stepId: string) => void;
  onResetStep: (stepId: string) => void;
  onUpdateStep: (stepId: string, action: any, label: string) => void;
  onInsertStep: (index: number, step: { label: string; action: StepAction }) => void;
  onInsertPrompt: (index: number, prompt: string) => void;
  onAddBeforeEachStep: (step: { label: string; action: StepAction }) => void;
  onRemoveBeforeEachStep: (stepId: string) => void;
  onRunAll: () => void;
  onRunActAndAssert: () => void;
  onRunGroup: (stepIds: string[]) => void;
  onReorderStep: (fromIndex: number, toIndex: number) => void;
  onExport: () => void;
  sidebarMode: 'session' | 'library';
  onSidebarModeChange: (mode: 'session' | 'library') => void;
  onSaveTest: () => void;
  libraryEntries: LibraryEntry[];
  onLoadFromLibrary: (fileName: string) => void;
  onDeleteFromLibrary: (fileName: string) => void;
  onRefreshLibrary: () => void;
}
```

- [ ] **Step 3: Update the sidebar layout**

The sidebar session mode should render:

1. **Suite tabs** (top area, replaces "Tests" section): list of suites, each clickable. `+ New Suite` button.
2. **Divider**
3. **beforeEach section** (collapsible, blue accent): `▸/▾ ↻ beforeEach (N steps)`. When expanded, shows steps with the existing StepItem component. Has an insert button at the bottom to add steps.
4. **Test block sections** (collapsible, green accent): each test block is `▸/▾ test: block name`. When expanded, shows the existing step grouping (action + collapsible assertions). Double-click header to rename.
5. **+ New Test button** below the last test block
6. **Bottom bar**: Run All + Save to Library (unchanged)

The existing step grouping logic (action + assertion groups, collapse/expand, drag) stays exactly the same within each test block.

- [ ] **Step 4: Implement the beforeEach section**

Add a collapsible section for beforeEach steps:

```tsx
{/* beforeEach section */}
<div
  onClick={() => setBeforeEachCollapsed(!beforeEachCollapsed)}
  style={{
    padding: '4px 8px',
    fontSize: 10,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  }}
>
  <span>{beforeEachCollapsed ? '▸' : '▾'}</span>
  <span style={{ color: 'var(--accent-blue, #0969da)' }}>↻</span>
  <span style={{ color: 'var(--accent-blue, #0969da)', fontWeight: 600 }}>beforeEach</span>
  <span style={{ marginLeft: 'auto' }}>{currentSuite.beforeEach.length} step{currentSuite.beforeEach.length !== 1 ? 's' : ''}</span>
</div>
{!beforeEachCollapsed && (
  <div style={{ paddingLeft: 12 }}>
    {currentSuite.beforeEach.map((step, i) => (
      <StepItem
        key={step.id}
        step={step}
        index={i}
        onAccept={() => {/* execute beforeEach step */}}
        onDeny={() => onRemoveBeforeEachStep(step.id)}
        onReset={() => {}}
      />
    ))}
  </div>
)}
```

- [ ] **Step 5: Implement test block accordion sections**

Replace the flat step list with test block sections:

```tsx
{currentSuite.tests.map(block => {
  const isActiveBlock = block.id === activeBlockId;
  const isBlockCollapsed = !isActiveBlock; // only active block is expanded

  return (
    <div key={block.id}>
      <div
        onClick={() => onSwitchBlock(block.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setRenamingBlockId(block.id);
          setRenameBlockValue(block.name);
        }}
        style={{
          padding: '4px 8px',
          fontSize: 10,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span>{isBlockCollapsed ? '▸' : '▾'}</span>
        <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
          test: {block.name}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          {block.steps.length} step{block.steps.length !== 1 ? 's' : ''}
        </span>
        {currentSuite.tests.length > 1 && (
          <button onClick={(e) => { e.stopPropagation(); onDeleteBlock(block.id); }}
            style={{ background: 'none', color: 'var(--text-muted)', fontSize: 11, padding: '0 2px' }}>
            ×
          </button>
        )}
      </div>
      {!isBlockCollapsed && (
        <div style={{ paddingLeft: 12 }}>
          {/* Existing step grouping logic goes here, operating on block.steps */}
        </div>
      )}
    </div>
  );
})}
```

- [ ] **Step 6: Update tests**

Update `tests/renderer/StepSidebar.test.tsx` to use the new props and verify:
- Suite tabs render
- beforeEach section renders
- Test block sections render with collapsible behavior
- `+ New Test` button works

- [ ] **Step 7: Run all tests and build**

Run: `npx vitest run && npm run build`
Expected: All pass, build clean

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/StepSidebar.tsx tests/renderer/StepSidebar.test.tsx
git commit -m "feat(sidebar): add beforeEach section and test block accordions"
```

---

### Task 7: Update IPC handlers and preload for TestSuite

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/types.ts`
- Modify: `tests/main/library-ipc.test.ts`

- [ ] **Step 1: Update IPC handler types**

In `src/main/ipc-handlers.ts`, the library handlers already pass opaque objects through IPC, so the type change from `TestCase` to `TestSuite` flows through automatically. Verify the handler signatures accept `any` and pass through to TestLibrary.

- [ ] **Step 2: Update renderer types**

In `src/renderer/types.ts`, update the library method signatures:

```typescript
saveToLibrary: (suite: import('@shared/types').TestSuite, fileName?: string) => Promise<{ fileName: string; path: string }>;
loadFromLibrary: (fileName: string) => Promise<import('@shared/types').TestSuite>;
```

- [ ] **Step 3: Update IPC test**

In `tests/main/library-ipc.test.ts`, update the mock data to use TestSuite structure.

- [ ] **Step 4: Run all tests and build**

Run: `npx vitest run && npm run build`
Expected: All pass, build clean

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts src/renderer/types.ts tests/main/library-ipc.test.ts
git commit -m "feat(ipc): update types for TestSuite in library IPC"
```

---

### Task 8: Final integration and verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Build the app**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Remove old TestCase type if unused**

Search for remaining `TestCase` usages. If nothing uses it, remove it from `src/shared/types.ts`. If the test exporter or other code still references it, leave it with a deprecation comment.

Run: `npx vitest run && npm run build`

- [ ] **Step 4: Commit if changes were made**

```bash
git add -A
git commit -m "chore: clean up deprecated TestCase references"
```
