import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeSession } from '../../src/main/claude-session';

vi.mock('@anthropic-ai/claude-code', () => ({
  claudeCode: vi.fn(),
}));

import { claudeCode } from '@anthropic-ai/claude-code';

describe('ClaudeSession', () => {
  let session: ClaudeSession;

  beforeEach(() => {
    session = new ClaudeSession();
    vi.clearAllMocks();
  });

  it('sends a message with page context and parses step responses', async () => {
    const mockResponse = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: "I'll navigate to /login and fill in the form.",
            steps: [
              { label: 'Navigate to /login', action: { type: 'navigate', url: '/login' } },
              { label: 'Fill email', action: { type: 'fill', selector: 'input[name="email"]', value: 'test@test.com' } },
            ],
          }),
        },
      ],
    };

    vi.mocked(claudeCode).mockResolvedValue(mockResponse as any);

    const result = await session.send('test the login page', {
      url: 'http://localhost:3000',
      accessibilityTree: '{"role":"document","children":[]}',
      screenshot: 'base64data',
    });

    expect(result.message).toBe("I'll navigate to /login and fill in the form.");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].label).toBe('Navigate to /login');
    expect(result.steps[0].action.type).toBe('navigate');
  });

  it('handles responses with no steps', async () => {
    const mockResponse = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'What would you like me to test?',
            steps: [],
          }),
        },
      ],
    };

    vi.mocked(claudeCode).mockResolvedValue(mockResponse as any);

    const result = await session.send('help', {
      url: 'http://localhost:3000',
      accessibilityTree: '{}',
      screenshot: '',
    });

    expect(result.message).toBe('What would you like me to test?');
    expect(result.steps).toHaveLength(0);
  });
});
