// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

import { ClaudeSession } from '../../src/main/claude-session';

function mockQueryResult(resultText: string) {
  mockQuery.mockReturnValueOnce(
    (async function* () {
      yield { type: 'result', subtype: 'success', result: resultText };
    })(),
  );
}

describe('ClaudeSession', () => {
  let session: ClaudeSession;

  beforeEach(() => {
    session = new ClaudeSession();
    mockQuery.mockReset();
  });

  it('sends a message with page context and parses step responses', async () => {
    const responseJson = JSON.stringify({
      message: "I'll navigate to /login and fill in the form.",
      steps: [
        { label: 'Navigate to /login', action: { type: 'navigate', url: '/login' } },
        { label: 'Fill email', action: { type: 'fill', selector: 'input[name="email"]', value: 'test@test.com' } },
      ],
    });

    mockQueryResult(responseJson);

    const result = await session.send('test the login page', {
      url: 'http://localhost:3000',
      accessibilityTree: '{"role":"document","children":[]}',
      screenshot: Buffer.from('fake-png-data'),
    });

    expect(result.message).toBe("I'll navigate to /login and fill in the form.");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].label).toBe('Navigate to /login');
    expect(result.steps[0].action.type).toBe('navigate');

    // Verify query was called with image (prompt is an async iterable, not a string)
    const call = mockQuery.mock.calls[0][0];
    expect(typeof call.prompt).not.toBe('string'); // async generator for image path
  });

  it('handles responses with no steps', async () => {
    const responseJson = JSON.stringify({
      message: 'What would you like me to test?',
      steps: [],
    });

    mockQueryResult(responseJson);

    const result = await session.send('help', {
      url: 'http://localhost:3000',
      accessibilityTree: '{}',
      screenshot: Buffer.alloc(0),
    });

    expect(result.message).toBe('What would you like me to test?');
    expect(result.steps).toHaveLength(0);

    // Empty screenshot → string prompt (no image)
    const call = mockQuery.mock.calls[0][0];
    expect(typeof call.prompt).toBe('string');
  });

  it('sends before/after screenshots for visual QA', async () => {
    const responseJson = JSON.stringify({
      message: 'The page navigated to /dashboard. I can see a welcome banner.',
      steps: [
        { label: 'Verify URL is /dashboard', action: { type: 'assert', assertionType: 'url', expected: '/dashboard' } },
      ],
    });

    mockQueryResult(responseJson);

    const before = Buffer.from('before-screenshot');
    const after = Buffer.from('after-screenshot');

    const result = await session.requestVisualQA(before, after, 'Navigate to /dashboard');

    expect(result.message).toContain('dashboard');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].action.type).toBe('assert');

    // Verify query was called (prompt is an async iterable for two images)
    const call = mockQuery.mock.calls[0][0];
    expect(typeof call.prompt).not.toBe('string');
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

  it('clears snapshots on clearHistory', () => {
    session.addSnapshot(Buffer.from('img'), 'http://localhost', 'step-1');
    expect(session.getSnapshots()).toHaveLength(1);

    session.clearHistory();
    expect(session.getSnapshots()).toHaveLength(0);
  });

  it('handles non-JSON responses gracefully', async () => {
    mockQueryResult('I cannot parse that request, sorry.');

    const result = await session.send('gibberish', {
      url: 'http://localhost:3000',
      accessibilityTree: '{}',
      screenshot: Buffer.alloc(0),
    });

    expect(result.message).toBe('I cannot parse that request, sorry.');
    expect(result.steps).toHaveLength(0);
  });
});
