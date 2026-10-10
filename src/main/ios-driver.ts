import { spawn, type ChildProcess } from 'child_process';
import type { Candidate } from './jev-decider';

// Drives an iOS simulator through the XCUITest runner in ios-runner/: a UI test that serves
// JSON commands over HTTP (see ios-runner/SuziQaiRunnerUITests/Commands.swift).

export interface IosNode {
  type: string;
  id: string;
  label: string;
  value?: string;
  placeholder?: string;
  enabled: boolean;
  selected: boolean;
  frame: [number, number, number, number];
  children?: IosNode[];
}

export interface IosElement extends IosNode {
  /** Position among all elements with the same type, id and label — matches XCUITest's query order. */
  index: number;
}

export interface IosQuery {
  type: string;
  id?: string;
  label?: string;
  index: number;
}

const ACTIONABLE = new Set([
  'button', 'textField', 'secureTextField', 'textView', 'searchField', 'switch', 'toggle', 'cell',
  'link', 'segmentedControl', 'slider', 'stepper', 'picker', 'datePicker', 'menuItem',
]);

/** Enabled, actionable elements in document order. */
export function flattenTree(root: IosNode): IosElement[] {
  const seen = new Map<string, number>();
  const out: IosElement[] = [];
  const walk = (n: IosNode) => {
    // Count every node, so the index matches XCUITest queries (which include disabled elements)
    const key = `${n.type}\u0000${n.id}\u0000${n.label}`;
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    if (ACTIONABLE.has(n.type) && n.enabled) out.push({ ...n, children: undefined, index });
    n.children?.forEach(walk);
  };
  walk(root);
  return out;
}

export function queryFor(e: IosElement): IosQuery {
  return { type: e.type, ...(e.id ? { id: e.id } : {}), ...(e.label ? { label: e.label } : {}), index: e.index };
}

/** Jev candidates: the name carries the label and the identifier, since either may be the meaningful one. */
export function toCandidates(elements: IosElement[]): Candidate[] {
  return elements.map((e, i) => {
    const text = e.label || e.placeholder || '';
    const name = e.id && e.id !== text ? (text ? `${text} (id: ${e.id})` : `(id: ${e.id})`) : text;
    return {
      n: i + 1,
      role: e.type,
      name,
      ...(e.value ? { value: e.value } : {}),
      locator: JSON.stringify(queryFor(e)),
    };
  });
}

export interface IosDriverOptions {
  udid: string;
  port?: number;
  /** Path to the runner's .xctestrun (built by `npm run ios-runner:build`). */
  xctestrun: string;
}

export class IosDriver {
  private proc: ChildProcess | null = null;
  private readonly port: number;

  constructor(private readonly opts: IosDriverOptions) {
    this.port = opts.port ?? 22087;
  }

  /** Starts the runner on the simulator and waits until it answers. */
  async start(timeoutMs = 120_000): Promise<void> {
    this.proc = spawn('xcodebuild', [
      'test-without-building',
      '-xctestrun', this.opts.xctestrun,
      '-destination', `id=${this.opts.udid}`,
      '-only-testing:SuziQaiRunnerUITests/RunnerTests/testServe',
    ], {
      // xcodebuild forwards TEST_RUNNER_* variables to the test process without the prefix
      env: { ...process.env, TEST_RUNNER_SUZIQAI_RUNNER_PORT: String(this.port) },
      stdio: 'ignore',
    });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await this.send('health');
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error(`iOS runner did not start within ${timeoutMs / 1000}s`);
  }

  async stop(): Promise<void> {
    await this.send('shutdown').catch(() => undefined);
    this.proc?.kill();
    this.proc = null;
  }

  launch(bundleId: string, args: string[] = []) {
    return this.send('launch', { bundleId, args });
  }

  async tree(): Promise<IosNode> {
    return (await this.send('tree')) as IosNode;
  }

  tap(query: IosQuery) {
    return this.send('tap', { query });
  }

  type(text: string, query?: IosQuery) {
    return this.send('type', { text, ...(query ? { query } : {}) });
  }

  private async send(command: string, body: object = {}): Promise<unknown> {
    const res = await fetch(`http://127.0.0.1:${this.port}/${command}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const json = (await res.json()) as { ok: boolean; result?: unknown; error?: string };
    if (!json.ok) throw new Error(`iOS runner ${command} failed: ${json.error}`);
    return json.result;
  }
}
