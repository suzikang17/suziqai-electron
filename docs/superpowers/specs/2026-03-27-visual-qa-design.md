# Visual QA Design Spec

**Date:** 2026-03-27
**Status:** Draft
**Depends on:** 2026-03-25-suziqai-design.md

## Overview

Add visual QA capabilities to suziQai by switching the AI backend from a Claude CLI subprocess to the Anthropic API SDK (`@anthropic-ai/sdk`), enabling screenshots to be sent as first-class image content blocks. After each step executes, the system automatically captures before/after screenshots and asks Claude to analyze what changed, suggest assertions, and recommend what to test next.

## Goals

- Send screenshots to Claude as real images on every chat message
- Automatically analyze visual changes after step execution
- Proactively suggest assertions and next steps based on what Claude sees
- Maintain a snapshot timeline for within-session visual comparison

## Non-Goals (this iteration)

- Cross-session visual regression (persisting reference screenshots to disk)
- Configurable QA frequency or cost controls
- Separate QA model selection (e.g., Haiku for cheaper QA)

## Architecture

### Claude Session — Direct API

Replace the CLI subprocess (`claude --print`) with the `@anthropic-ai/sdk` Messages API. The `ClaudeSession` class manages a multi-turn conversation, sending base64 screenshots as `image` content blocks alongside text.

```
ClaudeSession
├── client: Anthropic (SDK client, uses ANTHROPIC_API_KEY env var)
├── messages: MessageParam[] (conversation history)
├── systemPrompt: string (existing prompt, extended with visual QA instructions)
├── snapshots: Array<{ screenshot: Buffer; url: string; stepId: string; timestamp: number }>
│
├── send(userMessage, context) → ClaudeResponse
│   Builds a user message with:
│   ├── image block (screenshot as base64 PNG)
│   ├── text block (a11y tree + URL + current steps + user message)
│   Appends to messages[], calls Messages API, parses response
│
├── requestVisualQA(before, after, stepLabel) → ClaudeResponse
│   Sends before/after screenshots with focused prompt:
│   "Here's before/after screenshots after performing [stepLabel].
│    What changed? Suggest assertions to verify. What to test next?"
│   Returns { message, steps } in the same shape as send()
│
├── addSnapshot(screenshot, url, stepId) → void
│   Pushes to the snapshot timeline array
│
├── processRecording(rawEvents) → ClaudeResponse (unchanged)
└── clearHistory() → void (also clears snapshots)
```

### Enriched Chat Context

Every chat message includes the richest possible context:

1. **Image block** — current viewport screenshot (base64 PNG)
2. **Text block** containing:
   - Current URL
   - Accessibility tree (pruned)
   - Current test steps with statuses (e.g., `Step 1 [passed]: Navigate to /login`)
   - Snapshot count (e.g., "4 screenshots captured so far")
   - User's actual message

### Post-Step Visual Analysis

After each step executes, the system captures before/after screenshots and sends them to Claude for analysis.

**Single step execution flow:**

1. User accepts step → IPC `STEP_EXECUTE`
2. Capture "before" screenshot
3. Execute Playwright action
4. Wait 500ms for DOM to settle
5. Capture "after" screenshot + fresh accessibility tree
6. Add "after" snapshot to timeline
7. Send both screenshots to `requestVisualQA()`
8. Claude returns `{ message, steps }`:
   - `message` describes what changed visually → sent to chat panel via `CHAT_RESPONSE`
   - `steps` contains suggested assertions and next steps → sent to sidebar via `STEPS_PROPOSED`

**Run All flow:**

- Visual QA fires after every 3rd step (not every step) to balance cost vs coverage
- Always fires after the final step

### System Prompt Extension

The existing system prompt gets an additional section:

```
## Visual QA

You can see screenshots of the browser. When you receive before/after screenshots:
- Describe what changed visually (layout shifts, new elements, removed elements, text changes)
- Suggest assertions to verify the change (prefer getByRole/getByText visibility and text checks)
- Recommend what to test next based on what you see
- Flag anything that looks off: misalignment, missing elements, unexpected states, error messages

When you receive a single screenshot with a chat message:
- Use the visual context to give better answers
- Proactively suggest assertions for what you see on screen
- If you notice UI issues (broken layouts, truncated text, overlapping elements), mention them
```

### Response Format

No new response shape. Claude continues to respond with `{ message, steps }`. Visual QA results are just steps with assertion actions:

```json
{
  "message": "After clicking Submit, I can see the dashboard loaded with a welcome banner. The URL changed to /dashboard.",
  "steps": [
    { "label": "Verify URL is /dashboard", "action": { "type": "assert", "assertionType": "url", "expected": "/dashboard" } },
    { "label": "Verify welcome banner is visible", "action": { "type": "assert", "assertionType": "visible", "selector": "getByText('Welcome back')", "expected": "" } }
  ]
}
```

### Snapshot Timeline

An in-memory array tracking all captured screenshots during the session:

```typescript
interface Snapshot {
  screenshot: Buffer;
  url: string;
  stepId: string;
  timestamp: number;
}
```

Not persisted to disk in this iteration. Cleared when the session is cleared. Exists as a foundation for the future cross-session visual regression feature.

## File Changes

**New dependency:**
- `@anthropic-ai/sdk`

**Modified files:**

| File | Change |
|------|--------|
| `src/main/claude-session.ts` | Replace CLI spawn with `@anthropic-ai/sdk` client. Build multi-turn `messages[]` with image content blocks. Add `requestVisualQA()` method. Add snapshot timeline. |
| `src/main/ipc-handlers.ts` | Update `STEP_EXECUTE` to capture before/after screenshots and call `requestVisualQA`. Throttle in Run All (every 3rd step + final). Send QA results via existing IPC channels. |
| `src/shared/types.ts` | Add `VisualQAResult` type. Add `VISUAL_QA_RESULT` IPC channel. |
| `src/main/claude-code.d.ts` | Remove — no longer needed with `@anthropic-ai/sdk` which ships its own types. |

**No new source files.** Everything fits into existing modules.

**Test changes:**
- Update `tests/main/claude-session.test.ts` to mock `@anthropic-ai/sdk` instead of CLI spawn
- Add test cases for `requestVisualQA()` and snapshot timeline management

**Renderer unchanged** — visual QA results flow through existing `CHAT_RESPONSE` and `STEPS_PROPOSED` IPC channels. No new UI components needed.
