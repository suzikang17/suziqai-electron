import { query } from '@anthropic-ai/claude-agent-sdk';
import type { StepAction, Snapshot } from '../shared/types';
import { extractJson } from './json-reply';
import { LEAN_OPTIONS, WarmClaude } from './warm-claude';

/** Goal rounds are many small screen-level decisions: a fast model by default. */
export const GOAL_MODEL = () => process.env.SUZIQAI_GOAL_MODEL || 'claude-sonnet-5-5';
/** Chat, visual QA and planning: the SDK's default model unless SUZIQAI_MODEL is set. */
function modelOption(model?: string): { model?: string } {
  const m = model || process.env.SUZIQAI_MODEL;
  return m ? { model: m } : {};
}

interface PageContext {
  url: string;
  accessibilityTree: string;
  screenshot: Buffer;
  currentSteps?: Array<{ label: string; status: string }>;
}

interface ClaudeResponse {
  message: string;
  steps: Array<{ label: string; action: StepAction }>;
}

const SYSTEM_PROMPT = `You are suziQai, an AI assistant that helps developers write robust Playwright UI tests.

## Actions

You control a browser through these actions:
- navigate(url): Navigate to a URL
- click(selector): Click an element
- fill(selector, value): Type into an input field
- press(selector, key): Press a key on an element, e.g. Enter to submit a field with no submit button
- assert(assertionType, expected, selector?, attribute?): Add a test assertion. Types: visible, hidden, text, value, url, attribute, enabled, disabled, checked, unchecked, focused, editable, empty, count.
  - url: expected is text the URL contains, or a regex written as "/pattern/" (e.g. "/weekOf=\\d{4}-\\d{2}-\\d{2}/")
  - attribute: set "attribute" to the attribute name and expected to its value, e.g. { "assertionType": "attribute", "selector": "getByRole('button', { name: 'Week', exact: true })", "attribute": "aria-pressed", "expected": "true" }
- Secrets: never write real credentials; use {{env.NAME}} placeholders in values (e.g. "{{env.TEST_EMAIL}}"), resolved from the environment at run time
- swipe(direction, selector?): Swipe up/down/left/right (the finger's direction). With a selector, swipe on that element (e.g. left on a list row to reveal its Delete action); without one, swipe the screen to scroll ("up" reveals content further down)
- screenshot(): Capture the current browser state
- waitFor(selector): Wait for an element to appear

## Response Format

When the user describes what to test, respond with a JSON object:
{
  "message": "Your conversational response explaining what you'll do",
  "steps": [
    { "label": "Human-readable step description", "action": { "type": "navigate", "url": "/login" } },
    { "label": "Fill in email", "action": { "type": "fill", "selector": "getByLabel('Email')", "value": "test@test.com" } },
    { "label": "Submit with Enter", "action": { "type": "press", "selector": "getByLabel('Email')", "key": "Enter" } }
  ]
}

If the user asks a question (like "which selector is best?"), respond with just a message and empty steps array.

Always respond with valid JSON. Keep conversational messages concise.

## Playwright Locator Best Practices (IMPORTANT)

Use this priority order for selectors — higher is better:

1. **getByRole(role, { name })** — BEST. Uses ARIA roles and accessible names. Resilient to DOM changes, class renames, and refactors.
   - Example: getByRole('button', { name: 'Submit' })

2. **getByLabel(text)** — GREAT for form inputs.
   - Example: getByLabel('Email address')

3. **getByPlaceholder(text)** — GOOD for inputs without visible labels.
   - Example: getByPlaceholder('Search...')

4. **getByText(text)** — GOOD for non-interactive elements.
   - Example: getByText('Welcome back')

5. **getByTestId(id)** — OK. Stable but requires data-testid attributes.
   - Example: getByTestId('submit-button')

6. **CSS selectors** — LAST RESORT. Brittle.

## Selector Guidelines

- NEVER use XPath
- NEVER use nth-child or index-based selectors unless absolutely necessary
- Prefer exact text matches over partial
- For buttons/links, always use getByRole — not getByText
- For form fields, always try getByLabel first

## Testing Best Practices

- Test user-visible behavior, not implementation details
- Assert on what the user sees (text, visibility, URL) not internal state
- Use waitFor for elements that appear after async operations
- Group related actions: navigate → interact → assert
- Add assertions after actions to verify the action had the expected effect
- Consider error states: what happens with invalid input?

## Visual QA

You can see screenshots of the browser. When you receive before/after screenshots:
- Describe what changed visually (layout shifts, new elements, removed elements, text changes)
- Suggest assertions to verify the change (prefer getByRole/getByText visibility and text checks)
- Recommend what to test next based on what you see
- Flag anything that looks off: misalignment, missing elements, unexpected states, error messages

When you receive a single screenshot with a chat message:
- Use the visual context to give better answers
- Proactively suggest assertions for what you see on screen
- If you notice UI issues (broken layouts, truncated text, overlapping elements), mention them`;

function buildStepsSummary(steps?: Array<{ label: string; status: string }>): string {
  if (!steps || steps.length === 0) return '';
  const lines = steps.map((s, i) => `Step ${i + 1} [${s.status}]: ${s.label}`);
  return `\nCurrent test steps:\n${lines.join('\n')}`;
}

export interface QueryStats {
  durationMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

let lastStats: QueryStats | null = null;

function captureStats(message: any): void {
  lastStats = {
    durationMs: message.duration_ms ?? 0,
    costUsd: message.total_cost_usd ?? 0,
    inputTokens:
      (message.usage?.input_tokens ?? 0) +
      (message.usage?.cache_read_input_tokens ?? 0) +
      (message.usage?.cache_creation_input_tokens ?? 0),
    outputTokens: message.usage?.output_tokens ?? 0,
  };
}

async function runQuery(prompt: string, systemPrompt: string, model?: string): Promise<string> {
  let result = '';
  for await (const message of query({
    prompt,
    options: {
      systemPrompt,
      maxTurns: 1,
      ...LEAN_OPTIONS,
      ...modelOption(model),
    },
  })) {
    if ('result' in message && message.type === 'result') {
      result = (message as any).result ?? '';
      captureStats(message);
    }
  }
  return result;
}

async function runQueryWithImage(
  textContent: string,
  imageBase64: string,
  systemPrompt: string,
  model?: string,
): Promise<string> {
  const userMessage = {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/png' as const,
            data: imageBase64,
          },
        },
        {
          type: 'text' as const,
          text: textContent,
        },
      ],
    },
    parent_tool_use_id: null,
    session_id: '',
  };

  let result = '';
  for await (const message of query({
    prompt: (async function* () {
      yield userMessage;
    })(),
    options: {
      systemPrompt,
      maxTurns: 1,
      ...LEAN_OPTIONS,
      ...modelOption(model),
    },
  })) {
    if ('result' in message && message.type === 'result') {
      result = (message as any).result ?? '';
      captureStats(message);
    }
  }
  return result;
}

async function runQueryWithTwoImages(
  textContent: string,
  image1Base64: string,
  image2Base64: string,
  systemPrompt: string,
): Promise<string> {
  const userMessage = {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/png' as const,
            data: image1Base64,
          },
        },
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/png' as const,
            data: image2Base64,
          },
        },
        {
          type: 'text' as const,
          text: textContent,
        },
      ],
    },
    parent_tool_use_id: null,
    session_id: '',
  };

  let result = '';
  for await (const message of query({
    prompt: (async function* () {
      yield userMessage;
    })(),
    options: {
      systemPrompt,
      maxTurns: 1,
      ...LEAN_OPTIONS,
      ...modelOption(),
    },
  })) {
    if ('result' in message && message.type === 'result') {
      result = (message as any).result ?? '';
      captureStats(message);
    }
  }
  return result;
}

export interface GoalPlanInput {
  goal: string;
  done: string[];
  lastError?: string;
  round: number;
  url: string;
  screen: string;
  screenshot: Buffer;
  /** e.g. the iOS prefix, so steps use device descriptions instead of web locators */
  platformHint?: string;
}

export interface GoalPlan {
  status: 'continue' | 'done' | 'stuck';
  message: string;
  steps: Array<{ label: string; action: StepAction }>;
}

const GOAL_PROMPT = `## Goal mode

You are driving the app toward a goal one screen at a time. You only see the CURRENT screen; plan only what is visible on it.

Respond with JSON: { "status": "continue" | "done" | "stuck", "message": "...", "steps": [...] }
- "continue": steps = the next 1-5 steps that can ALL be performed on THIS screen without it changing (e.g. typing into several fields of one form is one batch). Stop at the first step that changes the screen (a navigation, opening a dialog, submitting) — include that step as the last one; you will be asked again afterwards.
- "done": the goal is achieved on this screen. steps = 1-3 assertion steps that prove it (e.g. the saved item is visible). Do not add action steps.
- "stuck": you cannot make progress (the needed control doesn't exist, access is denied, the app errored). message = why, in one sentence.

Rules:
- Never repeat a completed step. If the previous attempt failed, do something different (another element, another route).
- To reach a page whose URL you can see or infer (e.g. /schedule-board), use one navigate step instead of clicking through menus.
- If a drawer, menu or overlay covers the page (e.g. a click failed because another element "intercepts pointer events"), close it first: press Escape, or click its close control.
- Keep labels short and human: "Tap Add", "Type Dr. Paws into Name".
- Keep "message" to one short sentence about what you are doing next.`;

export class ClaudeSession {
  private snapshots: Snapshot[] = [];
  private warm: WarmClaude | null = null;

  private warmIdle: ReturnType<typeof setTimeout> | null = null;

  /**
   * Keeps one claude process open for goal rounds (see warm-claude.ts). It stays open for a minute
   * after a run ends, so the scenarios of a feature run share it.
   */
  beginGoalRun(): void {
    if (this.warmIdle) clearTimeout(this.warmIdle);
    this.warmIdle = null;
    this.warm ??= new WarmClaude(`${SYSTEM_PROMPT}\n\n${GOAL_PROMPT}`, GOAL_MODEL());
  }

  endGoalRun(idleMs = 60_000): void {
    if (this.warmIdle) clearTimeout(this.warmIdle);
    this.warmIdle = setTimeout(() => {
      this.warm?.close();
      this.warm = null;
      this.warmIdle = null;
    }, idleMs);
  }

  async send(userMessage: string, context: PageContext): Promise<ClaudeResponse> {
    const textParts = [
      `[Current page: ${context.url}]`,
      `[Accessibility tree: ${context.accessibilityTree}]`,
      buildStepsSummary(context.currentSteps),
      `[Snapshots captured: ${this.snapshots.length}]`,
      '',
      `User: ${userMessage}`,
    ];
    const textContent = textParts.filter(Boolean).join('\n');

    let text: string;
    if (context.screenshot && context.screenshot.length > 0) {
      text = await runQueryWithImage(
        textContent,
        context.screenshot.toString('base64'),
        SYSTEM_PROMPT,
      );
    } else {
      text = await runQuery(textContent, SYSTEM_PROMPT);
    }

    return this.parseResponse(text);
  }

  /** One round of goal mode: given the goal, progress so far and the current screen, what next? */
  async planGoal(input: GoalPlanInput): Promise<GoalPlan> {
    const done = input.done.length ? input.done.map((d, i) => `${i + 1}. ${d}`).join('\n') : '(nothing yet)';
    const text = [
      input.platformHint ?? '',
      `Goal: ${input.goal}`,
      `Round ${input.round}. Steps completed so far:\n${done}`,
      input.lastError ? `The previous attempt failed: ${input.lastError}` : '',
      `[Current page: ${input.url}]`,
      `[Screen: ${input.screen}]`,
    ].filter(Boolean).join('\n\n');

    const system = `${SYSTEM_PROMPT}\n\n${GOAL_PROMPT}`;
    const image = input.screenshot.length > 0 ? input.screenshot.toString('base64') : '';
    let raw: string;
    if (this.warm) {
      // Inside a goal run: the run's warm process, cleared before each round
      const content = image
        ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: image } }, { type: 'text' as const, text }]
        : text;
      const result = await this.warm.ask(content);
      captureStats(result.raw);
      raw = result.text;
    } else {
      raw = image
        ? await runQueryWithImage(text, image, system, GOAL_MODEL())
        : await runQuery(text, system, GOAL_MODEL());
    }

    const parsed = this.parseResponse(raw);
    let status: GoalPlan['status'] = 'continue';
    const s = extractJson(raw, (v) => 'status' in v)?.status;
    if (s === 'done' || s === 'stuck' || s === 'continue') status = s;
    if (status === 'continue' && parsed.steps.length === 0) status = 'stuck';
    return { status, message: parsed.message, steps: parsed.steps };
  }

  async requestVisualQA(
    before: Buffer,
    after: Buffer,
    stepLabel: string,
  ): Promise<ClaudeResponse> {
    const textContent = `I just executed this step: "${stepLabel}". The first image is BEFORE and the second is AFTER. What changed visually? Suggest assertions to verify the change, and recommend what to test next. Respond with JSON { "message": "...", "steps": [...] }.`;

    const text = await runQueryWithTwoImages(
      textContent,
      before.toString('base64'),
      after.toString('base64'),
      SYSTEM_PROMPT,
    );

    return this.parseResponse(text);
  }

  async processRecording(rawEvents: Array<{ type: string; selector?: string; value?: string }>): Promise<ClaudeResponse> {
    const message = `I recorded these browser interactions. Please convert them into clean, well-structured Playwright test steps using semantic locators. Deduplicate redundant actions, group related actions, and suggest assertions for what changed.

Raw events:
${JSON.stringify(rawEvents, null, 2)}`;

    return this.send(message, {
      url: '',
      accessibilityTree: '',
      screenshot: Buffer.alloc(0),
    });
  }

  addSnapshot(screenshot: Buffer, url: string, stepId: string): void {
    this.snapshots.push({
      screenshot,
      url,
      stepId,
      timestamp: Date.now(),
    });
  }

  /** Duration, cost and tokens of the most recent Claude call. */
  getLastStats(): QueryStats | null {
    return lastStats;
  }

  getSnapshots(): Snapshot[] {
    return [...this.snapshots];
  }

  clearHistory(): void {
    this.snapshots = [];
  }

  private parseResponse(text: string): ClaudeResponse {
    const parsed = extractJson<ClaudeResponse>(text, (v) => 'steps' in v || 'message' in v);
    if (!parsed) return { message: text, steps: [] };
    return {
      message: parsed.message,
      steps: (Array.isArray(parsed.steps) ? parsed.steps : []).map((s) => ({
        label: s.label,
        action: s.action,
      })),
    };
  }
}
