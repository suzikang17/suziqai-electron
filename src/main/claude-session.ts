import { claudeCode } from '@anthropic-ai/claude-code';
import type { Step, StepAction } from '../shared/types';

interface PageContext {
  url: string;
  accessibilityTree: string;
  screenshot: string;
}

interface ClaudeResponse {
  message: string;
  steps: Array<{ label: string; action: StepAction }>;
}

const SYSTEM_PROMPT = `You are suziQai, an AI assistant that helps developers write Playwright UI tests.

You control a browser through these actions:
- navigate(url): Navigate to a URL
- click(selector): Click an element (prefer getByRole, getByLabel, getByText selectors)
- fill(selector, value): Type into an input field
- assert(assertionType, expected, selector?): Add a test assertion. Types: url, visible, text, hidden, value
- screenshot(): Capture the current browser state
- waitFor(selector): Wait for an element to appear

When the user describes what to test, respond with a JSON object:
{
  "message": "Your conversational response explaining what you'll do",
  "steps": [
    { "label": "Human-readable step description", "action": { "type": "navigate", "url": "/login" } },
    { "label": "Fill in email", "action": { "type": "fill", "selector": "getByLabel('Email')", "value": "test@test.com" } }
  ]
}

Use Playwright's recommended locator strategy:
1. getByRole — most resilient
2. getByLabel — form elements
3. getByText — visible text
4. getByTestId — data-testid attributes
5. CSS selectors — last resort

Always respond with valid JSON. Keep conversational messages concise.`;

export class ClaudeSession {
  private conversationHistory: Array<{ role: string; content: string }> = [];

  async send(userMessage: string, context: PageContext): Promise<ClaudeResponse> {
    const contextBlock = `[Current page: ${context.url}]
[Accessibility tree: ${context.accessibilityTree}]`;

    const fullMessage = `${contextBlock}\n\nUser: ${userMessage}`;

    this.conversationHistory.push({ role: 'user', content: fullMessage });

    const response = await claudeCode({
      prompt: fullMessage,
      systemPrompt: SYSTEM_PROMPT,
      options: {
        maxTokens: 4096,
      },
    });

    const text = typeof response === 'string'
      ? response
      : Array.isArray(response.content)
        ? response.content.find((c: any) => c.type === 'text')?.text ?? ''
        : '';

    try {
      const parsed: ClaudeResponse = JSON.parse(text);
      this.conversationHistory.push({ role: 'assistant', content: text });

      return {
        message: parsed.message,
        steps: (parsed.steps ?? []).map((s, i) => ({
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
