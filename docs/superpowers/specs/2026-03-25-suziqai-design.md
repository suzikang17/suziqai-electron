# suziQai Design Spec

**Date:** 2026-03-25
**Status:** Draft

## Overview

suziQai is a standalone Electron desktop app for AI-assisted browser test authoring. It combines a live Playwright-controlled browser with an AI assistant powered by Claude Code to help developers interactively build, refine, and export UI tests. Generated tests are standard Playwright `.spec.ts` files with no vendor lock-in.

**Target audience:** Developers with a strong QA focus who want a faster, more interactive way to build robust UI tests.

## Architecture

### Application Shell

- **Framework:** Electron
- **Browser engine:** Playwright (starting with Chromium, supports Firefox/WebKit)
- **AI backend:** Claude Code SDK (`@anthropic-ai/claude-code`) invoked from Electron's main process
- **Test output:** Standard `@playwright/test` `.spec.ts` files

### Layout: Three-Panel Design

```
┌──────────────┬────────────────────────────────┐
│              │                                │
│  Test Steps  │       Browser Viewport         │
│  (sidebar)   │       (BrowserView)            │
│              │                                │
│  - Step 1 ✓  │   ┌──────────────────────┐     │
│  - Step 2 ✓  │   │                      │     │
│  - Step 3 ●  │   │    App Under Test    │     │
│  - Step 4 ○  │   │                      │     │
│  - Step 5 ○  │   └──────────────────────┘     │
│              │                                │
│  [Run All]   ├────────────────────────────────┤
│  [Export]    │       AI Chat Panel            │
│              │  AI: "I see you filled..."     │
│              │  You: "add error test too"     │
│              │  [Type a message...]  [Send]   │
└──────────────┴────────────────────────────────┘
```

- **Left sidebar (vertical):** Test step timeline. Each step shows status (passed ✓, running ●, pending ○, failed ✗), a human-readable label, and the underlying Playwright action. Includes Run All and Export buttons. Dropdown to switch between multiple tests in a session.
- **Top-right (~70% height):** Electron BrowserView displaying the Playwright-controlled browser. URL bar with back/forward/refresh. Toolbar with Record toggle, status indicator, browser selector, and device emulation dropdown. Visual overlay layer for highlighting elements during AI interaction.
- **Bottom-right (~30% height, resizable):** Chat interface. Scrollable message history, text input at bottom. Status badge showing current mode (Command/Recording/Observing).
- **Dividers are draggable** to resize panels.

## Modes of Operation

### 1. Command Mode (default)

User types natural language prompts in the chat. The AI interprets them and proposes a sequence of Playwright actions. Each proposed step appears in the left sidebar as "pending."

User can:
- **Accept** — execute the step
- **Deny** — discard the step
- **Edit** — modify the action before executing
- **Accept All** — run the entire proposed sequence

Example: "Log in with test@example.com and verify the dashboard loads" → AI proposes 5 steps in the sidebar.

### 2. Record Mode

User toggles the Record button. All manual browser interactions (clicks, keystrokes, navigations) are captured in real-time and displayed in the sidebar.

When recording stops, the raw event stream is sent to Claude Code for processing:

1. **Deduplication** — removes redundant actions
2. **Intent extraction** — converts raw selectors to semantic locators, groups low-level actions into meaningful steps
3. **Assertion suggestions** — proposes assertions based on what changed after actions

Processed steps appear in the sidebar for accept/edit/deny review.

### 3. Observe Mode

The AI watches silently as the user browses manually. Instead of recording raw actions, it builds understanding of what's being tested. When the user pauses or asks, the AI suggests:
- Assertions the user might have missed
- Edge cases to test (empty fields, wrong password, network errors)
- Additional flows related to what was explored

### Mode Interaction

Modes are not mutually exclusive. A typical workflow:
1. Record a login flow
2. Switch to Command to add specific assertions
3. Let Observe suggest edge cases
4. Export the complete test

## AI Integration

### Claude Code Subprocess

suziQai uses the Claude Code SDK (`@anthropic-ai/claude-code`) to spawn a persistent session from Electron's main process. The SDK provides a Node.js API for invoking Claude Code programmatically, which is a natural fit since Electron's main process is Node.js. The session persists for the duration of the test-building session, maintaining context across prompts — no re-explaining needed.

### Context Sent to Claude Code

On each interaction, suziQai packages:
- Current page URL
- Pruned accessibility tree (simplified DOM snapshot)
- Screenshot of current browser state
- Current test steps so far
- User's chat message

### Tool Definitions

Claude Code is given these tools, which map to Playwright API calls:

| Tool | Playwright Equivalent | Description |
|------|----------------------|-------------|
| `navigate(url)` | `page.goto(url)` | Navigate to a URL |
| `click(selector)` | `page.click(selector)` | Click an element |
| `fill(selector, value)` | `page.fill(selector, value)` | Type into an input |
| `assert(type, expected)` | `expect(...)` | Add a test assertion |
| `screenshot()` | `page.screenshot()` | Capture current state |
| `waitFor(selector)` | `page.waitForSelector()` | Wait for element |
| `getDOM()` | Custom | Request fresh DOM snapshot |

Claude Code proposes tool calls. suziQai intercepts them (does not execute directly), presents them as steps in the sidebar, and only executes upon user approval.

## Test Generation & Export

### Export Flow

1. User clicks "Export .spec.ts" in the sidebar
2. suziQai sends the approved steps to Claude Code
3. Claude Code generates a complete, idiomatic Playwright test file with:
   - `test.describe` blocks
   - `test.beforeEach` for shared setup
   - Proper `expect` assertions
   - Meaningful test names derived from intent
4. User chooses save location (defaults to project's test directory)
5. Generated file runs independently with `npx playwright test`

### Locator Strategy

AI prefers Playwright's recommended locator priority:
1. `getByRole` — most resilient
2. `getByLabel` — form elements
3. `getByText` — visible text
4. `getByTestId` — data-testid attributes
5. CSS selectors — last resort

### Multiple Tests Per Session

- Sidebar shows the current test
- Dropdown to switch between tests or start a new one
- Export individually or as a single spec file with multiple tests

## Record & Replay

### Recording

- Red indicator in browser toolbar when active
- Raw events appear in sidebar in real-time
- Captures: clicks, keystrokes, navigations, scrolls

### Replay

- "Run All" executes steps sequentially against the live browser
- Each step highlighted in sidebar as it runs
- On failure: execution pauses, step marked red, AI suggests fix
- Can re-run from any step (not just beginning)

### Iterative Refinement Loop

Record → Replay → Edit flaky steps → Replay again → Export when confident

## Project Setup & Configuration

### First Launch

1. Welcome screen → "Open Project" → select directory
2. Scan for `playwright.config.ts`
   - Found: read base URL, test directory, browser settings
   - Not found: offer to install `@playwright/test`, create config, download browsers
3. Check for Claude Code installation, prompt if not found
4. Launch three-panel interface

### Project Settings

Stored in `.suziqai/` in the project root (user adds to `.gitignore`):

- `config.json` — project-level settings
  - Base URL for app under test
  - Default browser (Chromium/Firefox/WebKit)
  - Test output directory
  - Locator strategy preference
  - Claude Code model selection
- `sessions/` — saved test-building sessions for resuming later

## Device Emulation

The browser toolbar includes a device emulation dropdown that leverages Playwright's built-in device descriptors. Users can select from common devices (iPhone 14, Pixel 7, iPad, etc.) to test responsive layouts.

When a device is selected, Playwright recreates the browser context with the device's viewport size, user agent, device scale factor, touch support, and `isMobile` flag. This enables testing mobile-specific behaviors (touch events, responsive breakpoints, mobile navigation patterns) without a real device or simulator.

The device selector shows "Desktop" by default (no emulation) and groups devices by category (phones, tablets).

## Non-Goals (v1)

- CI/CD integration (tests are standard Playwright, user runs them however they want)
- Multi-user collaboration
- Visual regression testing
- API testing
- Local/offline AI models
