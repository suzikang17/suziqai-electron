import { spawn } from 'child_process';
import type { StepAction } from '../shared/types';

interface PageContext {
  url: string;
  accessibilityTree: string;
  screenshot: string;
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
- Consider error states: what happens with invalid input?`;

function invokeClaudeCli(prompt: string, systemPrompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '--print', prompt,
      '--output-format', 'text',
      '--system-prompt', systemPrompt,
      '--max-turns', '1',
    ];

    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude CLI: ${err.message}. Is Claude Code installed?`));
    });
  });
}

export class ClaudeSession {
  private conversationHistory: Array<{ role: string; content: string }> = [];

  async send(userMessage: string, context: PageContext): Promise<ClaudeResponse> {
    const contextBlock = `[Current page: ${context.url}]
[Accessibility tree: ${context.accessibilityTree}]`;

    const fullMessage = `${contextBlock}\n\nUser: ${userMessage}`;

    this.conversationHistory.push({ role: 'user', content: fullMessage });

    const text = await invokeClaudeCli(fullMessage, SYSTEM_PROMPT);

    try {
      // Try to extract JSON from the response (may be wrapped in markdown fences)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      const parsed: ClaudeResponse = JSON.parse(jsonStr);
      this.conversationHistory.push({ role: 'assistant', content: jsonStr });

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
