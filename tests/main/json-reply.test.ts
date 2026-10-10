// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractJson } from '../../src/main/json-reply';

describe('extractJson', () => {
  it('reads a bare or fenced object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('ignores braces in prose and inside strings', () => {
    expect(extractJson('Use {curly} words. {"message":"a } b","steps":[]}')).toEqual({ message: 'a } b', steps: [] });
  });

  it('takes the last answer when the model revises itself', () => {
    const reply = 'I see the board. Actually the sidebar is open — let me close it.\n```json\n{"status":"continue","steps":[{"label":"x"}]}\n```\nWait, better:\n{"status":"done","steps":[]}';
    expect(extractJson(reply, (v) => 'status' in v)).toEqual({ status: 'done', steps: [] });
  });

  it('prefers accepted objects over trailing unrelated ones', () => {
    expect(extractJson('{"status":"continue"} and {"note":1}', (v) => 'status' in v)).toEqual({ status: 'continue' });
  });

  it('returns undefined when nothing parses', () => {
    expect(extractJson('no json {here')).toBeUndefined();
  });
});
