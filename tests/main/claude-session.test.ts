// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, default: actual, spawn: mockSpawn };
});

import { ClaudeSession } from '../../src/main/claude-session';

function createMockProc(stdout: string) {
  const proc = new EventEmitter() as any;
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  proc.stdout = stdoutEmitter;
  proc.stderr = stderrEmitter;
  proc.stdin = { write: vi.fn(), end: vi.fn() };

  // Use the original stdout.on to intercept when a listener is added,
  // then emit data once a 'data' listener is attached
  const origOn = stdoutEmitter.on.bind(stdoutEmitter);
  stdoutEmitter.on = (event: string, listener: (...args: any[]) => void) => {
    origOn(event, listener);
    if (event === 'data') {
      // Defer to allow the promise to be set up
      setImmediate(() => {
        stdoutEmitter.emit('data', Buffer.from(stdout));
        proc.emit('close', 0);
      });
    }
    return stdoutEmitter;
  };

  return proc;
}

describe('ClaudeSession', () => {
  let session: ClaudeSession;

  beforeEach(() => {
    session = new ClaudeSession();
    mockSpawn.mockReset();
  });

  it('sends a message with page context and parses step responses', async () => {
    const responseJson = JSON.stringify({
      message: "I'll navigate to /login and fill in the form.",
      steps: [
        { label: 'Navigate to /login', action: { type: 'navigate', url: '/login' } },
        { label: 'Fill email', action: { type: 'fill', selector: 'input[name="email"]', value: 'test@test.com' } },
      ],
    });

    mockSpawn.mockReturnValue(createMockProc(responseJson));

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
    const responseJson = JSON.stringify({
      message: 'What would you like me to test?',
      steps: [],
    });

    mockSpawn.mockReturnValue(createMockProc(responseJson));

    const result = await session.send('help', {
      url: 'http://localhost:3000',
      accessibilityTree: '{}',
      screenshot: '',
    });

    expect(result.message).toBe('What would you like me to test?');
    expect(result.steps).toHaveLength(0);
  });
});
