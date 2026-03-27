import { query } from '@anthropic-ai/claude-agent-sdk';
import type { StepAction, Snapshot } from '../shared/types';

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
- assert(assertionType, expected, selector?): Add a test assertion. Types: url, visible, text, hidden, value
- screenshot(): Capture the current browser state
- waitFor(selector): Wait for an element to appear

## Response Format

When the user describes what to test, respond with a JSON object:
{
  "message": "Your conversational response explaining what you'll do",
  "steps": [
    { "label": "Human-readable step description", "action": { "type": "navigate", "url": "/login" } },
    { "label": "Fill in email", "action": { "type": "fill", "selector": "getByLabel('Email')", "value": "test@test.com" } }
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

async function runQuery(prompt: string, systemPrompt: string): Promise<string> {
  let result = '';
  for await (const message of query({
    prompt,
    options: {
      systemPrompt,
      maxTurns: 1,
      allowedTools: [],
    },
  })) {
    if ('result' in message && message.type === 'result') {
      result = (message as any).result ?? '';
    }
  }
  return result;
}

async function runQueryWithImage(
  textContent: string,
  imageBase64: string,
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
      allowedTools: [],
    },
  })) {
    if ('result' in message && message.type === 'result') {
      result = (message as any).result ?? '';
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
      allowedTools: [],
    },
  })) {
    if ('result' in message && message.type === 'result') {
      result = (message as any).result ?? '';
    }
  }
  return result;
}

export class ClaudeSession {
  private snapshots: Snapshot[] = [];

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

  getSnapshots(): Snapshot[] {
    return [...this.snapshots];
  }

  clearHistory(): void {
    this.snapshots = [];
  }

  private parseResponse(text: string): ClaudeResponse {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      const parsed: ClaudeResponse = JSON.parse(jsonStr);

      return {
        message: parsed.message,
        steps: (parsed.steps ?? []).map((s) => ({
          label: s.label,
          action: s.action,
        })),
      };
    } catch {
      return { message: text, steps: [] };
    }
  }
}
