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
