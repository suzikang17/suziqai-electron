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

export type IosElement = Omit<IosNode, 'children'>;

export interface IosQuery {
  type: string;
  id?: string;
  label?: string;
  /** Used for unlabelled fields, which XCUITest still exposes by placeholder. */
  placeholder?: string;
  /** Stable start of a label that contains a time or count ("Done at 12:14 AM" → "Done at"). */
  labelContains?: string;
  /** Position among all elements matching the other fields — how XCUITest's element(boundBy:) counts. */
  index: number;
}

export interface Screen {
  /** Every element in document order. */
  all: IosElement[];
  /** Enabled elements a user can act on. */
  actionable: IosElement[];
}

const ACTIONABLE = new Set([
  'button', 'textField', 'secureTextField', 'textView', 'searchField', 'switch', 'toggle', 'cell',
  'link', 'segmentedControl', 'slider', 'stepper', 'picker', 'datePicker', 'menuItem',
]);

export function readScreen(root: IosNode): Screen {
  const all: IosElement[] = [];
  const walk = (n: IosNode) => {
    const { children, ...element } = n;
    all.push(element);
    children?.forEach(walk);
  };
  walk(root);
  return { all, actionable: all.filter((e) => ACTIONABLE.has(e.type) && e.enabled) };
}

function matches(e: IosElement, q: Omit<IosQuery, 'index'>): boolean {
  return (
    e.type === q.type &&
    (q.id === undefined || e.id === q.id) &&
    (q.label === undefined || e.label === q.label) &&
    (q.labelContains === undefined || e.label.includes(q.labelContains)) &&
    (q.placeholder === undefined || (!e.label && e.placeholder === q.placeholder))
  );
}

export function findByQuery(all: IosElement[], q: IosQuery): IosElement | undefined {
  return all.filter((e) => matches(e, q))[q.index ?? 0];
}

/**
 * A developer-set accessibilityIdentifier (camelCase, e.g. "scheduleRow.Breakfast"), as opposed
 * to the SF Symbol name SwiftUI fills in for image buttons ("plus", "gearshape.fill").
 */
function isDeveloperId(id: string): boolean {
  return /[A-Z]/.test(id);
}

/** Labels with digits (times, counts, dates) change between runs; match their text before the first digit. */
function stableLabelPrefix(label: string): string | null {
  if (!/\d/.test(label)) return null;
  const prefix = label.split(/\d/)[0].replace(/[\s,:–-]+$/, '');
  return prefix.length >= 3 ? prefix : null;
}

/** The query suziQai and exported tests use for `e`; `all` must be the screen it came from. */
export function queryFor(e: IosElement, all: IosElement[]): IosQuery {
  const byId = e.id && isDeveloperId(e.id) && all.filter((x) => x.type === e.type && x.id === e.id).length === 1;
  const fields: Omit<IosQuery, 'index'> = byId
    ? { type: e.type, id: e.id }
    : {
        type: e.type,
        ...(e.id ? { id: e.id } : {}),
        ...(e.label ? (stableLabelPrefix(e.label) ? { labelContains: stableLabelPrefix(e.label)! } : { label: e.label }) : {}),
        ...(!e.label && e.placeholder ? { placeholder: e.placeholder } : {}),
      };
  return { ...fields, index: all.filter((x) => matches(x, fields)).indexOf(e) };
}

/** Jev candidates: the name carries the label and the identifier, since either may be the meaningful one. */
export function toCandidates(elements: IosElement[], all: IosElement[]): Candidate[] {
  return elements.map((e, i) => {
    const text = e.label || e.placeholder || '';
    const name = e.id && e.id !== text ? (text ? `${text} (id: ${e.id})` : `(id: ${e.id})`) : text;
    return {
      n: i + 1,
      role: e.type,
      name,
      ...(e.value ? { value: e.value } : {}),
      locator: JSON.stringify(queryFor(e, all)),
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
    // A runner left behind by a crashed or killed session holds the port and the XCUITest session
    await this.send('shutdown').catch(() => undefined);
    await new Promise<void>((resolve) => {
      spawn('pkill', ['-f', 'SuziQaiRunnerUITests/RunnerTests/testServe']).on('close', () => resolve());
    });

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

  /** Tap at a point in app coordinates (e.g. an element's frame centre) — faster than a query tap. */
  tapAt(x: number, y: number) {
    return this.send('tapAt', { x, y });
  }

  swipe(direction: 'up' | 'down' | 'left' | 'right', query?: IosQuery) {
    return this.send('swipe', { direction, ...(query ? { query } : {}) });
  }

  async screenshot(): Promise<Buffer> {
    const { png } = (await this.send('screenshot')) as { png: string };
    return Buffer.from(png, 'base64');
  }

  /** Current system alert, or tap one of its buttons by label. */
  alert(tap?: string) {
    return this.send('alert', tap ? { tap } : {}) as Promise<{ present: boolean; title?: string; buttons?: string[]; tapped?: string }>;
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
