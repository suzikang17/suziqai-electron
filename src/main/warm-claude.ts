import { query } from '@anthropic-ai/claude-agent-sdk';

// Each query() starts a claude CLI process: ~7-9s before the model sees the prompt. A goal run
// makes a call per round, so it keeps one process open for the whole run (streaming input) and
// sends /clear before every round: the next round answers in about a second and still sees
// nothing but its own prompt.

export type UserContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } }
    >;

interface UserMessage {
  type: 'user';
  message: { role: 'user'; content: UserContent };
  parent_tool_use_id: null;
  session_id: string;
}

export interface WarmResult {
  text: string;
  raw: unknown;
}

/** Options for a bare planner process: no tools, and none of the user's settings, MCP servers or plugins. */
export const LEAN_OPTIONS = {
  tools: [] as string[],
  allowedTools: [] as string[],
  settingSources: [] as never[],
  strictMcpConfig: true,
  mcpServers: {},
};

export class WarmClaude {
  private readonly pending: UserMessage[] = [];
  private wake: (() => void) | null = null;
  private closed = false;
  private readonly messages: AsyncIterator<unknown>;
  /** Serialises ask() calls: one round at a time on the one process. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(systemPrompt: string, model?: string) {
    const self = this;
    const input = (async function* () {
      for (;;) {
        while (self.pending.length) yield self.pending.shift()!;
        if (self.closed) return;
        await new Promise<void>((resolve) => (self.wake = resolve));
        self.wake = null;
      }
    })();
    this.messages = query({
      prompt: input,
      options: { systemPrompt, ...(model ? { model } : {}), ...LEAN_OPTIONS },
    } as Parameters<typeof query>[0])[Symbol.asyncIterator]();
  }

  /** One independent round: clears the conversation, then asks. */
  ask(content: UserContent): Promise<WarmResult> {
    const run = this.queue.then(async () => {
      await this.turn('/clear');
      return this.turn(content);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  close(): void {
    this.closed = true;
    this.wake?.();
    void this.messages.return?.();
  }

  private async turn(content: UserContent): Promise<WarmResult> {
    if (this.closed) throw new Error('Claude session closed');
    this.pending.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' });
    this.wake?.();
    for (;;) {
      const { value, done } = await this.messages.next();
      if (done) throw new Error('Claude session ended unexpectedly');
      const m = value as { type?: string; result?: string; is_error?: boolean };
      if (m.type !== 'result') continue;
      if (m.is_error) throw new Error(`Claude returned an error: ${m.result ?? ''}`);
      return { text: m.result ?? '', raw: m };
    }
  }
}
