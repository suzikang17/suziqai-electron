import Anthropic from '@anthropic-ai/sdk';
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

1. **getByRole(role, { name })** — BEST. Uses ARIA roles and accessible names. Resilient to DOM changes, class renames, and refactors. Mirrors how users and screen readers find elements.
   - Use for buttons, links, headings, textboxes, checkboxes, etc.
   - Example: getByRole('button', { name: 'Submit' })
   - The "name" comes from: visible text, aria-label, aria-labelledby, or associated <label>

2. **getByLabel(text)** — GREAT for form inputs. Finds inputs by their associated label text.
   - Works with <label for="id">, wrapping <label>, aria-label, aria-labelledby
   - Example: getByLabel('Email address')

3. **getByPlaceholder(text)** — GOOD for inputs without visible labels.
   - Example: getByPlaceholder('Search...')

4. **getByText(text)** — GOOD for non-interactive elements (paragraphs, headings, spans).
   - Avoid for buttons/links — use getByRole instead
   - Example: getByText('Welcome back')

5. **getByTestId(id)** — OK. Stable but requires developers to add data-testid attributes.
   - Example: getByTestId('submit-button')

6. **CSS selectors** — LAST RESORT. Brittle, breaks on class renames, restructuring.
   - Never use auto-generated classes (e.g., .css-1a2b3c)
   - If you must, prefer #id over .class over tag

## Selector Guidelines

- NEVER use XPath
- NEVER use nth-child or index-based selectors unless absolutely necessary
- Prefer exact text matches over partial (getByText('Submit') not getByText('Sub'))
- For buttons/links, always use getByRole — not getByText
- For form fields, always try getByLabel first
- If multiple elements match, add { exact: true } or use a more specific role+name
- Consider i18n: if text might be translated, prefer getByRole or getByTestId over getByText

## Testing Best Practices

- Test user-visible behavior, not implementation details
- Assert on what the user sees (text, visibility, URL) not internal state
- Use waitFor for elements that appear after async operations
- Group related actions: navigate → interact → assert
- One assertion per logical check — don't combine unrelated assertions
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

export class ClaudeSession {
  private client: Anthropic;
  private messages: Anthropic.MessageParam[] = [];
  private snapshots: Snapshot[] = [];

  constructor() {
    this.client = new Anthropic();
  }

  async send(userMessage: string, context: PageContext): Promise<ClaudeResponse> {
    const contentBlocks: Anthropic.ContentBlockParam[] = [];

    // Add screenshot as image block
    if (context.screenshot && context.screenshot.length > 0) {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: context.screenshot.toString('base64'),
        },
      });
    }

    // Build text context
    const textParts = [
      `[Current page: ${context.url}]`,
      `[Accessibility tree: ${context.accessibilityTree}]`,
      buildStepsSummary(context.currentSteps),
      `[Snapshots captured: ${this.snapshots.length}]`,
      '',
      `User: ${userMessage}`,
    ];

    contentBlocks.push({
      type: 'text',
      text: textParts.filter(Boolean).join('\n'),
    });

    this.messages.push({ role: 'user', content: contentBlocks });

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: this.messages,
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    const text = textBlock?.text ?? '';

    // Store assistant response in conversation history
    this.messages.push({ role: 'assistant', content: response.content });

    return this.parseResponse(text);
  }

  async requestVisualQA(
    before: Buffer,
    after: Buffer,
    stepLabel: string,
  ): Promise<ClaudeResponse> {
    const contentBlocks: Anthropic.ContentBlockParam[] = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: before.toString('base64'),
        },
      },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: after.toString('base64'),
        },
      },
      {
        type: 'text',
        text: `I just executed this step: "${stepLabel}". The first image is BEFORE and the second is AFTER. What changed visually? Suggest assertions to verify the change, and recommend what to test next. Respond with JSON { "message": "...", "steps": [...] }.`,
      },
    ];

    this.messages.push({ role: 'user', content: contentBlocks });

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: this.messages,
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    const text = textBlock?.text ?? '';

    this.messages.push({ role: 'assistant', content: response.content });

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
    this.messages = [];
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
