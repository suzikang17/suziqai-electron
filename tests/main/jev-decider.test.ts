// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  extractCandidates,
  buildLocator,
  buildRequest,
  decide,
  type AXNode,
  type Candidate,
} from '../../src/main/jev-decider';

function ax(nodeId: string, role: string, name?: string, extra: Partial<AXNode> = {}): AXNode {
  return {
    nodeId,
    role: { value: role },
    ...(name !== undefined ? { name: { value: name } } : {}),
    ...extra,
  };
}

describe('extractCandidates', () => {
  it('keeps actionable roles in document order and numbers them from 1', () => {
    const nodes = [
      ax('1', 'RootWebArea', 'Login'),
      ax('2', 'heading', 'Welcome'),
      ax('3', 'textbox', 'Email', { backendDOMNodeId: 30 }),
      ax('4', 'StaticText', 'Forgot?'),
      ax('5', 'button', 'Sign in', { backendDOMNodeId: 50 }),
    ];

    const candidates = extractCandidates(nodes);

    expect(candidates.map((c) => [c.n, c.role, c.name])).toEqual([
      [1, 'textbox', 'Email'],
      [2, 'button', 'Sign in'],
    ]);
    expect(candidates[1].backendNodeId).toBe(50);
  });

  it('skips ignored and disabled nodes', () => {
    const nodes = [
      ax('1', 'button', 'Hidden', { ignored: true }),
      ax('2', 'button', 'Off', { properties: [{ name: 'disabled', value: { value: true } }] }),
      ax('3', 'link', 'Home'),
    ];

    expect(extractCandidates(nodes).map((c) => c.name)).toEqual(['Home']);
  });

  it('strips icon-font glyphs from names', () => {
    const [c] = extractCandidates([ax('1', 'button', '\uF090 Login')]);
    expect(c.name).toBe('Login');
  });

  it('records the current value of fields', () => {
    const [c] = extractCandidates([ax('1', 'textbox', 'Email', { value: { value: 'a@b.co' } })]);
    expect(c.value).toBe('a@b.co');
  });
});

describe('buildLocator', () => {
  it('builds a getByRole locator with the accessible name', () => {
    expect(buildLocator('button', 'Sign in')).toBe("getByRole('button', { name: 'Sign in' })");
  });

  it('uses double quotes when the name contains a single quote', () => {
    expect(buildLocator('link', "What's new")).toBe(`getByRole('link', { name: "What's new" })`);
  });

  it('omits the name when there is none', () => {
    expect(buildLocator('textbox', '')).toBe("getByRole('textbox')");
  });
});

describe('buildRequest', () => {
  const candidates: Candidate[] = [
    { n: 1, role: 'textbox', name: 'Email', locator: "getByRole('textbox', { name: 'Email' })" },
    { n: 2, role: 'button', name: 'Sign in', locator: "getByRole('button', { name: 'Sign in' })" },
  ];

  it('asks for a target in both option orders plus an action', () => {
    const req = buildRequest('Click sign in', candidates, { url: 'http://x', title: 'Login' });

    expect(Object.keys(req.questions)).toEqual(['target', 'target_reversed', 'action']);
    expect(Object.keys(req.questions.target.criteria)).toEqual(['e1', 'e2', 'none']);
    expect(Object.keys(req.questions.target_reversed.criteria)).toEqual(['e2', 'e1', 'none']);
    expect(Object.keys(req.questions.action.criteria)).toEqual(['click', 'fill']);
    expect(req.state).toContain('[e2] button "Sign in"');
    expect(req.state).toContain('Click sign in');
  });

  it('caps the options under the API limit of 255', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      n: i + 1, role: 'link', name: `L${i}`, locator: '',
    }));
    const req = buildRequest('x', many, { url: '', title: '' });
    expect(Object.keys(req.questions.target.criteria).length).toBeLessThanOrEqual(241);
  });
});

describe('decide', () => {
  const candidates: Candidate[] = [
    { n: 1, role: 'textbox', name: 'Email', locator: "getByRole('textbox', { name: 'Email' })" },
    { n: 2, role: 'button', name: 'Sign in', locator: "getByRole('button', { name: 'Sign in' })" },
  ];

  function client(answers: Record<string, unknown>) {
    return {
      systemOne: vi.fn().mockResolvedValue({
        model: 'jev-1.13.0',
        answers,
        usage: { input_tokens: 400, output_tokens: 40 },
      }),
    };
  }

  it('returns the chosen candidate, action, confidence and stability', async () => {
    const c = client({
      target: { type: 'choice', choice: 'e2', confidence: 0.9, probabilities: { e1: 0.05, e2: 0.95, none: 0 } },
      target_reversed: { type: 'choice', choice: 'e2', confidence: 0.88, probabilities: { e1: 0.06, e2: 0.94, none: 0 } },
      action: { type: 'choice', choice: 'click', confidence: 0.99, probabilities: { click: 1, fill: 0 } },
    });

    const d = await decide(c, 'Click sign in', candidates, { url: '', title: '' });

    expect(d.candidate?.name).toBe('Sign in');
    expect(d.action).toBe('click');
    expect(d.confidence).toBe(0.9);
    expect(d.stable).toBe(true);
    expect(d.confident).toBe(true);
    expect(d.usage.input_tokens).toBe(400);
    expect(d.model).toBe('jev-1.13.0');
  });

  it('flags unstable and low-confidence picks', async () => {
    const c = client({
      target: { type: 'choice', choice: 'e1', confidence: 0.3, probabilities: { e1: 0.5, e2: 0.5, none: 0 } },
      target_reversed: { type: 'choice', choice: 'e2', confidence: 0.3, probabilities: { e1: 0.5, e2: 0.5, none: 0 } },
      action: { type: 'choice', choice: 'click', confidence: 0.9, probabilities: { click: 1, fill: 0 } },
    });

    const d = await decide(c, 'something', candidates, { url: '', title: '' });

    expect(d.stable).toBe(false);
    expect(d.confident).toBe(false);
  });

  it('returns no candidate when Jev picks none', async () => {
    const c = client({
      target: { type: 'choice', choice: 'none', confidence: 0.8, probabilities: { e1: 0, e2: 0.1, none: 0.9 } },
      target_reversed: { type: 'choice', choice: 'none', confidence: 0.8, probabilities: { e1: 0, e2: 0.1, none: 0.9 } },
      action: { type: 'choice', choice: 'click', confidence: 0.9, probabilities: { click: 1, fill: 0 } },
    });

    const d = await decide(c, 'something', candidates, { url: '', title: '' });

    expect(d.candidate).toBeNull();
    expect(d.confident).toBe(false);
  });
});
