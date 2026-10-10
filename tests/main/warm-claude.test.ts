// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: mockQuery }));

import { WarmClaude } from '../../src/main/warm-claude';

/** A fake claude process: one result per user message, echoing it back with a turn number. */
function fakeProcess() {
  const seen: unknown[] = [];
  mockQuery.mockImplementationOnce(({ prompt }: { prompt: AsyncIterable<{ message: { content: unknown } }> }) =>
    (async function* () {
      for await (const m of prompt) {
        seen.push(m.message.content);
        yield { type: 'assistant' };
        yield { type: 'result', result: `turn ${seen.length}: ${typeof m.message.content === 'string' ? m.message.content : 'image'}` };
      }
    })(),
  );
  return seen;
}

describe('WarmClaude', () => {
  it('runs every round on one process, clearing the conversation first', async () => {
    const seen = fakeProcess();
    const warm = new WarmClaude('system', 'claude-sonnet-5-5');
    expect((await warm.ask('round one')).text).toBe('turn 2: round one');
    expect((await warm.ask([{ type: 'text', text: 'round two' }])).text).toBe('turn 4: image');
    expect(seen).toEqual(['/clear', 'round one', '/clear', [{ type: 'text', text: 'round two' }]]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0].options).toMatchObject({ systemPrompt: 'system', model: 'claude-sonnet-5-5', settingSources: [] });
    warm.close();
  });

  it('serialises overlapping asks', async () => {
    const seen = fakeProcess();
    const warm = new WarmClaude('system');
    const [a, b] = await Promise.all([warm.ask('a'), warm.ask('b')]);
    expect([a.text, b.text]).toEqual(['turn 2: a', 'turn 4: b']);
    expect(seen).toEqual(['/clear', 'a', '/clear', 'b']);
    warm.close();
  });

  it('surfaces error results', async () => {
    mockQuery.mockImplementationOnce(({ prompt }: { prompt: AsyncIterable<unknown> }) =>
      (async function* () {
        for await (const _ of prompt) yield { type: 'result', is_error: true, result: 'rate limited' };
      })(),
    );
    const warm = new WarmClaude('system');
    await expect(warm.ask('x')).rejects.toThrow(/rate limited/);
    warm.close();
  });
});
