import type { StepAction } from '../shared/types';
import { decide, type Candidate, type JevClient } from './jev-decider';
import { findByQuery, queryFor, readScreen, toCandidates, type IosDriver, type IosElement, type IosNode, type IosQuery } from './ios-driver';

// Runs suziQai steps on an iOS app. A step's selector is either a resolved JSON query from the
// driver ({type,id,label,index} or {alert}) or a plain description; descriptions — and saved
// queries that no longer match the screen — are resolved with Jev at run time.

export type DriverLike = Pick<IosDriver, 'tree' | 'tapAt' | 'type' | 'launch' | 'alert'>;

export interface IosAppConfig {
  bundleId: string;
  launchArgs?: string[];
}

/** Called before acting on an element (Watch mode shows where it will tap, then pauses). */
export type BeforeAct = (element: IosElement, screen: IosNode['frame'], label: string) => Promise<void>;

export interface IosStepResult {
  /** Set when the step's element was (re)resolved; save it back onto the step. */
  resolvedSelector?: string;
}

type Target = { kind: 'element'; element: IosElement; all: IosElement[] } | { kind: 'alert'; button: string };

function parseSelector(selector: string): (IosQuery & { alert?: string }) | null {
  if (!selector.trim().startsWith('{')) return null;
  try {
    return JSON.parse(selector);
  } catch {
    return null;
  }
}

function allLabels(n: IosNode): string[] {
  return [n.label, n.value ?? '', ...(n.children ?? []).flatMap(allLabels)].filter(Boolean);
}

export class IosSession {
  beforeAct: BeforeAct | null = null;

  constructor(
    private readonly driver: DriverLike,
    private readonly jev: JevClient | null,
    private readonly app: IosAppConfig,
  ) {}

  launch() {
    return this.driver.launch(this.app.bundleId, this.app.launchArgs ?? []);
  }

  /** Text description of the current screen, sent to Claude in place of a web accessibility tree. */
  async describeScreen(): Promise<string> {
    const tree = await this.driver.tree();
    const screen = readScreen(tree);
    const elements = toCandidates(screen.actionable, screen.all).map((c) => `- ${c.role} "${c.name}"${c.value ? ` value="${c.value}"` : ''}`);
    const text = [...new Set(allLabels(tree))].slice(0, 80);
    return `iOS app ${this.app.bundleId}\nInteractive elements:\n${elements.join('\n')}\nText on screen:\n${text.join(' | ')}`;
  }

  async execute(label: string, action: StepAction, timeoutMs = 5000): Promise<IosStepResult> {
    switch (action.type) {
      case 'navigate':
        await this.launch();
        return {};
      case 'screenshot':
        return {};
      case 'assert':
        return this.assert(label, action);
      case 'waitFor':
        return this.waitFor(label, action.selector, timeoutMs);
    }

    const { target, resolved } = await this.resolve(label, action);
    if (target.kind === 'alert') {
      if (action.type !== 'click') throw new Error(`Only taps work on system alerts ("${label}")`);
      await this.driver.alert(target.button);
    } else {
      const query = queryFor(target.element, target.all);
      await this.beforeAct?.(target.element, target.all[0]?.frame ?? [0, 0, 0, 0], label);
      if (action.type === 'click') {
        const [x, y, w, h] = target.element.frame;
        await this.driver.tapAt(x + w / 2, y + h / 2);
      } else if (action.type === 'fill') {
        await this.driver.type(action.value, query);
      } else if (action.type === 'press') {
        if (action.key !== 'Enter') throw new Error(`Key "${action.key}" isn't supported on iOS yet`);
        await this.driver.type('\n', query);
      }
    }
    return resolved ? { resolvedSelector: resolved } : {};
  }

  private async resolve(label: string, action: Extract<StepAction, { selector: string }>): Promise<{ target: Target; resolved?: string }> {
    const [tree, alert] = await Promise.all([this.driver.tree(), this.driver.alert()]);
    const { all, actionable: elements } = readScreen(tree);
    const saved = parseSelector(action.selector);

    if (saved?.alert && alert.buttons?.includes(saved.alert)) return { target: { kind: 'alert', button: saved.alert } };
    if (saved && !saved.alert) {
      const match = findByQuery(all, saved);
      if (match) return { target: { kind: 'element', element: match, all } };
    }

    if (!this.jev) throw new Error(`No Jev key set (TYPESAFE_API_KEY) — can't find "${label}" on screen`);

    const candidates: Candidate[] = toCandidates(elements, all);
    const alertButtons = alert.present ? alert.buttons ?? [] : [];
    alertButtons.forEach((button) =>
      candidates.push({ n: candidates.length + 1, role: 'alert button', name: button, locator: JSON.stringify({ alert: button }) }),
    );

    const hint = saved ? '' : ` Element: ${action.selector}.`;
    const detail = action.type === 'fill' ? ` (type "${action.value}")` : action.type === 'press' ? ` (press ${action.key})` : '';
    const decision = await decide(this.jev, `${label}.${hint}${detail}`, candidates, { url: `ios://${this.app.bundleId}`, title: this.app.bundleId });
    if (!decision.confident || !decision.candidate) {
      throw new Error(`Jev is not sure which element "${label}" means (confidence ${decision.confidence.toFixed(2)})`);
    }

    const locator = decision.candidate.locator;
    const picked = JSON.parse(locator);
    if (picked.alert) return { target: { kind: 'alert', button: picked.alert }, resolved: locator };
    const element = elements[decision.candidate.n - 1];
    return { target: { kind: 'element', element, all }, resolved: locator };
  }

  /**
   * Finds any element (text included, not just tappable ones) for waitFor/assert targets:
   * a saved query, else on-screen text containing the selector, else Jev over labelled elements.
   */
  private async locate(label: string, selector: string, tree: IosNode): Promise<{ element?: IosElement; resolved?: string }> {
    const { all } = readScreen(tree);
    const nodes = all.filter((e) => (e.label || e.placeholder || e.id) && e.type !== 'application' && e.type !== 'window');
    const saved = parseSelector(selector);
    if (saved) {
      const match = findByQuery(all, saved);
      if (match || !this.jev) return { element: match };
    } else {
      // "Care Team screen" / "Schedule heading" → the visible text "Care Team" / "Schedule"
      const text = selector.replace(/\b(screen|page|heading|title|view|tab|section|label|text)\b/gi, '').replace(/\s+/g, ' ').trim();
      const byText = nodes.find((e) => e.label.includes(selector)) ?? (text ? nodes.find((e) => e.label === text) : undefined);
      if (byText) return { element: byText, resolved: JSON.stringify(queryFor(byText, all)) };
    }
    if (!this.jev || nodes.length === 0) return {};

    const decision = await decide(this.jev, `${label}. Element: ${selector}.`, toCandidates(nodes, all), { url: `ios://${this.app.bundleId}`, title: this.app.bundleId });
    if (!decision.confident || !decision.candidate) return {};
    return { element: nodes[decision.candidate.n - 1], resolved: decision.candidate.locator };
  }

  private async assert(label: string, action: Extract<StepAction, { type: 'assert' }>): Promise<IosStepResult> {
    const tree = await this.driver.tree();
    if (action.assertionType === 'text') {
      if (!allLabels(tree).some((l) => l.includes(action.expected))) throw new Error(`Text "${action.expected}" is not on screen`);
      return {};
    }

    const target = action.selector || action.expected;
    const { element, resolved } = await this.locate(label, target, tree);
    const result = resolved && action.selector ? { resolvedSelector: resolved } : {};
    switch (action.assertionType) {
      case 'visible':
        if (!element) throw new Error(`"${target}" is not on screen`);
        return result;
      case 'hidden':
        if (element) throw new Error(`"${target}" is still on screen`);
        return {};
      case 'value':
        if (!element) throw new Error(`Field "${target}" is not on screen`);
        if ((element.value ?? '') !== action.expected) throw new Error(`Expected value "${action.expected}", got "${element.value ?? ''}"`);
        return result;
      default:
        throw new Error(`"${action.assertionType}" assertions aren't supported on iOS yet`);
    }
  }

  private async waitFor(label: string, selector: string, timeoutMs: number): Promise<IosStepResult> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { element, resolved } = await this.locate(label, selector, await this.driver.tree());
      if (element) return resolved ? { resolvedSelector: resolved } : {};
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`"${selector}" did not appear within ${timeoutMs}ms`);
  }
}
