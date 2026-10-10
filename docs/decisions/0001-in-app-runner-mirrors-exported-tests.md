# ADR 0001: The in-app runner mirrors the exported tests instead of executing them

Date: 2026-10-10 · Status: accepted

## Context

suziQai has two engines that must agree: the in-app step runner (Playwright over CDP into the
BrowserView, or the XCUITest HTTP runner for iOS) and the exported test files (`.spec.ts`,
`.swift`). Today's work found several places where they had drifted: hooks were editable but
never run or exported, eight assertion types were silently dropped on export, URL checks meant
different things in each, and in-app assertions checked once while Playwright's `expect`
retries. A suite could pass in the app and fail in CI, or the reverse.

## Options

1. **Run the exported file in the app** (spawn `npx playwright test` / `xcodebuild test` per
   step or per test, parse the report). One engine; but stepping through, Watch mode, Jev
   self-healing, goal mode and the simulator screenshot loop all need per-step control the
   external runners don't offer, and each run would cost seconds of startup.
2. **Keep the in-app runner and make its semantics match the exporters** — one shared step
   model, auto-retrying assertions, hooks in Playwright order, fresh start per run — and prove
   parity by running every suite both ways.
3. Generate the in-app runner *from* the exporter templates (a shared interpreter). Cleanest
   long-term, but a rewrite of both exporters.

## Decision

Option 2. The step model (`StepAction`, hooks, `{{env}}` placeholders, read-only guard) is the
single source of truth; the runner and both exporters implement it, and parity is checked by
running each authored suite in the app *and* as the exported file (TPS: 14/14 in-app, 2/2 as
Playwright; pet-homepage: 4 journeys in-app and 4/4 as XCUITest on two app versions).

## Consequences

- Every new step or assertion type must land in three places: runner, Playwright exporter,
  XCUITest exporter. Unit tests cover each; `generateSpec` / `generateXCUITest` tests are the
  contract.
- "Run All" starts fresh (cleared storage or relaunched app) and runs
  beforeAll → beforeEach → test → afterEach → afterAll, like CI.
- Goal mode and feature mode build on the same runner, so what they record is what gets
  exported.
- Revisit option 3 if a third target platform appears.
