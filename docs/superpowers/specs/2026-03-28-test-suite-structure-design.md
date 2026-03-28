# Test Suite Structure Design Spec

**Date:** 2026-03-28
**Status:** Approved

## Summary

Evolve the flat `TestCase` model into a `TestSuite` model that supports Playwright's test organization: `test.describe` blocks containing `test.beforeEach` hooks and multiple named `test()` blocks. Each suite maps to one `.spec.ts` file. The sidebar uses the existing collapsible accordion pattern to display hooks and test blocks.

## Goals

- Users can organize steps into multiple named test blocks within a suite
- Users can define shared setup steps in a `beforeEach` hook
- Claude can propose steps as shared setup (role: "setup") that go into beforeEach
- Each suite generates a well-structured `.spec.ts` with describe, beforeEach, and named tests
- Existing session data migrates seamlessly (TestCase → TestSuite with one TestBlock)
- The UI extends the existing collapsible group pattern — no new interaction paradigms

## Data Model

### Current (being replaced)

```typescript
interface TestCase {
  id: string;
  name: string;
  steps: Step[];
}
```

Session holds `TestCase[]`, each test is a flat list of steps.

### New

```typescript
interface TestBlock {
  id: string;
  name: string;
  steps: Step[];
}

interface TestSuite {
  id: string;
  name: string;
  beforeEach: Step[];
  tests: TestBlock[];
}
```

`TestSuite` replaces `TestCase` everywhere. A suite contains shared setup steps (`beforeEach`) and multiple named test blocks (`tests`). The existing `Step` type is unchanged.

### Migration

When loading old session data that contains `TestCase[]`, auto-migrate:
- `TestCase.name` → `TestSuite.name`
- `TestCase.id` → `TestSuite.id`
- `TestCase.steps` → `TestSuite.tests[0].steps` (single TestBlock named after the suite)
- `TestSuite.beforeEach` → `[]` (empty)

Detection: if the loaded object has `steps` array (old format) instead of `tests` array (new format), apply migration.

## UI Changes

### Sidebar Structure (Session Mode)

The sidebar extends the existing accordion pattern:

```
Session | Library          ← segmented toggle (unchanged)
─────────────────────
Tests                + New Suite
─────────────────────
Login Feature   5 steps    ← suite tab (existing test tab area)
Checkout Flow   3 steps
─────────────────────
▸ ↻ beforeEach (1 step)    ← collapsible, blue accent
─────────────────────
▾ test: valid login        ← collapsible, green accent
  ┌─ 1. Fill email         ← existing step + assertion grouping
  │  fill('input', 'x')
  │  ▾ 1 assertion
  │  └─ Assert email visible
  └─ 2. Click submit
▸ test: invalid login (2)  ← collapsed, shows step count
─────────────────────
+ New Test                 ← add test block within suite
─────────────────────
[Run All] [Save to Library]
```

### Visual Distinction

- **beforeEach steps:** Blue left border (`var(--accent-blue)`), `↻` icon prefix
- **Test block headers:** Green left border (`var(--accent-green)`), collapsible with `▸/▾`
- **Steps within test blocks:** Existing step item pattern with action + assertion grouping
- All collapsible sections use the same `▸/▾` toggle interaction

### Interactions

- **Create test block:** "+ New Test" button below the last test block, creates a new empty TestBlock
- **Create suite:** "+ New Suite" button in the Tests header area (replaces current "+ New")
- **Rename test block:** Double-click the test block header
- **Delete test block:** × button on hover (same pattern as current test tabs)
- **Move steps to beforeEach:** Drag a step from a test block to the beforeEach section, or right-click → "Move to Setup"
- **Active test block:** Clicking a collapsed test block expands it and focuses it for editing

### beforeEach Authoring

Two paths:

1. **Manual:** User creates/expands the beforeEach section and adds steps via the step composer or by dragging steps from test blocks
2. **AI-driven:** When Claude proposes steps, it can mark steps with `role: "setup"`. Steps with this role are added to `beforeEach` instead of the active test block. The system prompt is updated to instruct Claude about this capability.

## Code Generation

### Updated `generateSpec`

`generateSpec(suite: TestSuite, baseUrl?: string): string` produces:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('valid login', async ({ page }) => {
    await page.getByLabel('Email').fill('test@test.com');
    await page.getByLabel('Password').fill('secret');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('invalid login', async ({ page }) => {
    await page.getByLabel('Email').fill('bad@test.com');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });
});
```

Rules:
- Skip `test.beforeEach` block if `beforeEach` is empty
- Each `TestBlock` becomes a `test()` call
- Failed steps are excluded (existing behavior)
- If there's only one test block and no beforeEach, still wrap in `test.describe`

## Library Integration

- Each `TestSuite` saves as one `.spec.ts` + `.suziqai.json` pair (unchanged pattern)
- The sidecar stores the full `TestSuite` structure (with `tests[]` and `beforeEach`)
- Loading from library restores the full suite structure
- `LibraryEntry.stepCount` counts all steps across all test blocks + beforeEach

## Files to Change

### New Files
None — this modifies existing files.

### Modified Files

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `TestBlock`, `TestSuite` types. Update `IPC` if needed. |
| `src/shared/utils/generateSpec.ts` | Rewrite to accept `TestSuite`, emit describe/beforeEach/test structure |
| `src/renderer/App.tsx` | Replace `TestCase` state with `TestSuite`, update all handlers, add migration logic |
| `src/renderer/components/StepSidebar.tsx` | Add beforeEach section, test block accordion sections, "+ New Test" button |
| `src/main/test-library.ts` | Update save/load to use `TestSuite` instead of `TestCase` |
| `src/main/ipc-handlers.ts` | Update step execution to work with suite structure |
| `src/main/claude-session.ts` | Update system prompt to support `role: "setup"` step proposals |
| `src/preload/preload.ts` | No changes needed (passes opaque objects) |
| `tests/shared/types.test.ts` | Update for new types |
| `tests/main/test-library.test.ts` | Update for TestSuite format |
| `tests/renderer/StepSidebar.test.tsx` | Update for new sidebar structure |

## Testing Strategy

- Unit tests for `generateSpec` with suite structure (beforeEach + multiple tests)
- Unit tests for migration logic (TestCase → TestSuite)
- Unit tests for TestLibrary save/load with new format
- Component tests for StepSidebar with beforeEach section and test block accordions
- Verify backwards compatibility: old session.json loads correctly

## Future Extensibility

- `afterEach` hooks: add to TestSuite when needed
- `beforeAll` / `afterAll`: add to TestSuite for one-time setup
- Nested describes: extend TestBlock to contain child TestBlocks (not planned now)
- Page Object Model: generate POM classes from repeated step patterns
