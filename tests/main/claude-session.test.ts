// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class Anthropic {
      messages = { create: mockCreate };
    },
  };
});

import { ClaudeSession } from '../../src/main/claude-session';

function mockApiResponse(text: string) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text }],
  });
}

describe('ClaudeSession', () => {
  let session: ClaudeSession;

  beforeEach(() => {
    session = new ClaudeSession();
    mockCreate.mockReset();
  });

  it('sends a message with page context and parses step responses', async () => {
    const responseJson = JSON.stringify({
      message: "I'll navigate to /login and fill in the form.",
      steps: [
        { label: 'Navigate to /login', action: { type: 'navigate', url: '/login' } },
        { label: 'Fill email', action: { type: 'fill', selector: 'input[name="email"]', value: 'test@test.com' } },
      ],
    });

    mockApiResponse(responseJson);

    const result = await session.send('test the login page', {
      url: 'http://localhost:3000',
      accessibilityTree: '{"role":"document","children":[]}',
      screenshot: Buffer.from('fake-png-data'),
    });

    expect(result.message).toBe("I'll navigate to /login and fill in the form.");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].label).toBe('Navigate to /login');
    expect(result.steps[0].action.type).toBe('navigate');

    // Verify the API was called with image content
    const call = mockCreate.mock.calls[0][0];
    const userMsg = call.messages[0];
    expect(userMsg.role).toBe('user');
    expect(userMsg.content[0].type).toBe('image');
    expect(userMsg.content[0].source.type).toBe('base64');
    expect(userMsg.content[0].source.media_type).toBe('image/png');
  });

  it('handles responses with no steps', async () => {
    const responseJson = JSON.stringify({
      message: 'What would you like me to test?',
      steps: [],
    });

    mockApiResponse(responseJson);

    const result = await session.send('help', {
      url: 'http://localhost:3000',
      accessibilityTree: '{}',
      screenshot: Buffer.alloc(0),
    });

    expect(result.message).toBe('What would you like me to test?');
    expect(result.steps).toHaveLength(0);
  });

  it('sends before/after screenshots for visual QA', async () => {
    const responseJson = JSON.stringify({
      message: 'The page navigated to /dashboard. I can see a welcome banner.',
      steps: [
        { label: 'Verify URL is /dashboard', action: { type: 'assert', assertionType: 'url', expected: '/dashboard' } },
      ],
    });

    mockApiResponse(responseJson);

    const before = Buffer.from('before-screenshot');
    const after = Buffer.from('after-screenshot');

    const result = await session.requestVisualQA(before, after, 'Navigate to /dashboard');

    expect(result.message).toContain('dashboard');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].action.type).toBe('assert');

    // Verify two images were sent
    const call = mockCreate.mock.calls[0][0];
    const userMsg = call.messages[0];
    expect(userMsg.content[0].type).toBe('image');
    expect(userMsg.content[1].type).toBe('image');
    expect(userMsg.content[2].type).toBe('text');
  });

  it('manages snapshot timeline', () => {
    expect(session.getSnapshots()).toHaveLength(0);

    session.addSnapshot(Buffer.from('img1'), 'http://localhost/page1', 'step-1');
    session.addSnapshot(Buffer.from('img2'), 'http://localhost/page2', 'step-2');

    const snapshots = session.getSnapshots();
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].url).toBe('http://localhost/page1');
    expect(snapshots[1].stepId).toBe('step-2');
  });

  it('clears history and snapshots', async () => {
    session.addSnapshot(Buffer.from('img'), 'http://localhost', 'step-1');

    mockApiResponse(JSON.stringify({ message: 'hi', steps: [] }));
    await session.send('hello', {
      url: 'http://localhost',
      accessibilityTree: '{}',
      screenshot: Buffer.alloc(0),
    });

    session.clearHistory();

    expect(session.getSnapshots()).toHaveLength(0);

    // Next send should start fresh conversation
    mockApiResponse(JSON.stringify({ message: 'fresh', steps: [] }));
    const result = await session.send('new message', {
      url: 'http://localhost',
      accessibilityTree: '{}',
      screenshot: Buffer.alloc(0),
    });

    expect(result.message).toBe('fresh');

    // The first message in the conversation should be the new one (not the old one)
    const call = mockCreate.mock.calls[1][0];
    const firstUserContent = call.messages[0].content;
    const textBlock = firstUserContent.find((b: any) => b.type === 'text');
    expect(textBlock.text).toContain('new message');
  });
});
