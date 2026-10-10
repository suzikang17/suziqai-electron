import type { Page } from 'playwright';
import { resolveLocator } from './browser-actions';
import type { ChoiceResponse, SystemOneRequest, Usage } from '@typesafe-ai/sdk';

// Element-picking with TypeSafe's Jev decision model. Approach adapted from
// playjev (MIT, github.com/filedcom/playjev): number the actionable nodes of the
// accessibility tree, then ask Jev a choice question over those numbers.

export interface AXNode {
  nodeId: string;
  backendDOMNodeId?: number;
  ignored?: boolean;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: string | number };
  properties?: Array<{ name: string; value?: { value?: unknown } }>;
}

export interface Candidate {
  n: number;
  role: string;
  name: string;
  value?: string;
  backendNodeId?: number;
  locator: string;
}

export interface PageInfo {
  url: string;
  title: string;
}

export interface JevDecision {
  candidate: Candidate | null;
  action: 'click' | 'fill';
  confidence: number;
  /** Same pick when the options are presented in reverse order. */
  stable: boolean;
  /** Picked an element, above the confidence threshold, and stable. */
  confident: boolean;
  topProbabilities: Array<{ n: number | 'none'; p: number }>;
  candidateCount: number;
  truncated: boolean;
  model: string;
  usage: Usage;
}

export interface JevClient {
  systemOne(request: SystemOneRequest<any>): PromiseLike<{ model: string; answers: any; usage: Usage }>;
}

const ACTIONABLE_ROLES = new Set([
  'button', 'checkbox', 'combobox', 'link', 'listbox', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'option', 'radio', 'searchbox', 'slider', 'spinbutton', 'switch',
  'tab', 'textbox', 'treeitem',
]);

// The API allows 255 choice options; keep headroom for "none".
const MAX_OPTIONS = 240;
// playjev's default minimum target confidence.
export const MIN_CONFIDENCE = 0.55;

export function extractCandidates(nodes: AXNode[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const node of nodes) {
    if (node.ignored) continue;
    const role = String(node.role?.value ?? '');
    if (!ACTIONABLE_ROLES.has(role)) continue;
    const disabled = node.properties?.some((p) => p.name === 'disabled' && p.value?.value === true);
    if (disabled) continue;

    // Icon fonts put private-use glyphs in accessible names (e.g. Font Awesome U+F090)
    const name = String(node.name?.value ?? '').replace(/[\uE000-\uF8FF]/g, '').trim();
    const value = node.value?.value;
    candidates.push({
      n: candidates.length + 1,
      role,
      name,
      ...(value !== undefined && value !== '' ? { value: String(value) } : {}),
      ...(node.backendDOMNodeId !== undefined ? { backendNodeId: node.backendDOMNodeId } : {}),
      locator: buildLocator(role, name),
    });
  }
  return candidates;
}

export function buildLocator(role: string, name: string, exact = false): string {
  if (!name) return `getByRole('${role}')`;
  const q = name.includes("'") ? '"' : "'";
  return `getByRole('${role}', { name: ${q}${name}${q}${exact ? ', exact: true' : ''} })`;
}

function describe(c: Candidate): string {
  return `[e${c.n}] ${c.role} "${c.name}"${c.value ? ` value="${c.value}"` : ''}`;
}

/** Keep at most MAX_OPTIONS candidates, preferring ones that share words with the instruction. */
function limitCandidates(instruction: string, candidates: Candidate[]): Candidate[] {
  if (candidates.length <= MAX_OPTIONS) return candidates;
  const words = new Set(instruction.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const overlap = (c: Candidate) =>
    (c.name.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => words.has(w)).length;
  const keep = new Set(
    [...candidates]
      .sort((a, b) => overlap(b) - overlap(a))
      .slice(0, MAX_OPTIONS)
      .map((c) => c.n),
  );
  return candidates.filter((c) => keep.has(c.n));
}

export function buildRequest(instruction: string, candidates: Candidate[], page: PageInfo) {
  const options = limitCandidates(instruction, candidates);
  const criteria = (list: Candidate[]) => {
    const entries: Record<string, string | null> = {};
    for (const c of list) entries[`e${c.n}`] = null;
    entries.none = 'None of the listed elements can perform this step.';
    return entries;
  };

  const state = [
    `Page: ${page.title} (${page.url})`,
    `Test step to perform: ${instruction}`,
    'Interactive elements:',
    ...options.map(describe),
  ].join('\n');

  const targetInstructions =
    'Which listed element should this test step act on? Answer with the element whose role and name best match the step.';

  return {
    state,
    questions: {
      target: { type: 'choice' as const, instructions: targetInstructions, criteria: criteria(options) },
      target_reversed: {
        type: 'choice' as const,
        instructions: targetInstructions,
        criteria: criteria([...options].reverse()),
      },
      action: {
        type: 'choice' as const,
        instructions: 'Which browser operation does this test step perform on the element?',
        criteria: {
          click: 'Click, tap, press, open, select or toggle the element.',
          fill: 'Type or enter text into the element.',
        },
      },
    },
    truncated: options.length < candidates.length,
  };
}

export async function decide(
  client: JevClient,
  instruction: string,
  candidates: Candidate[],
  page: PageInfo,
): Promise<JevDecision> {
  const { truncated, ...request } = buildRequest(instruction, candidates, page);
  const result = await client.systemOne(request);

  const target = result.answers.target as ChoiceResponse;
  const reversed = result.answers.target_reversed as ChoiceResponse;
  const action = result.answers.action as ChoiceResponse;

  const byKey = (key: string) =>
    key === 'none' ? null : candidates.find((c) => `e${c.n}` === key) ?? null;
  const candidate = byKey(target.choice);
  const stable = target.choice === reversed.choice;

  const topProbabilities = Object.entries(target.probabilities as Record<string, number>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, p]) => ({ n: key === 'none' ? ('none' as const) : Number(key.slice(1)), p }));

  return {
    candidate,
    action: action.choice === 'fill' ? 'fill' : 'click',
    confidence: target.confidence,
    stable,
    confident: candidate !== null && stable && target.confidence >= MIN_CONFIDENCE,
    topProbabilities,
    candidateCount: candidates.length,
    truncated,
    model: result.model,
    usage: result.usage,
  };
}

/** Read the page's accessibility tree over CDP and number its actionable elements. */
export async function snapshotCandidates(page: Page): Promise<Candidate[]> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Accessibility.enable');
    const { nodes } = (await session.send('Accessibility.getFullAXTree')) as { nodes: AXNode[] };
    return extractCandidates(nodes);
  } finally {
    await session.detach().catch(() => undefined);
  }
}

/** Temporarily tag the DOM node behind a CDP backendNodeId with `data-jev-pick` while `fn` runs. */
export async function withMarkedElement<T>(page: Page, backendNodeId: number, fn: () => Promise<T>): Promise<T> {
  const session = await page.context().newCDPSession(page);
  try {
    const { object } = (await session.send('DOM.resolveNode', { backendNodeId })) as { object: { objectId: string } };
    const setMark = (fnBody: string) =>
      session.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: `function() { ${fnBody} }` });
    await setMark('this.setAttribute("data-jev-pick", "");');
    try {
      return await fn();
    } finally {
      await setMark('this.removeAttribute("data-jev-pick");');
    }
  } finally {
    await session.detach().catch(() => undefined);
  }
}

/**
 * A locator string that matches exactly the candidate's element: the plain getByRole
 * locator if unique, else with exact: true, else with .nth(i). Null if it can't be pinned.
 */
export async function uniqueLocator(page: Page, candidate: Candidate): Promise<string | null> {
  if ((await resolveLocator(page, candidate.locator).count()) === 1) return candidate.locator;

  const exact = candidate.name ? buildLocator(candidate.role, candidate.name, true) : candidate.locator;
  if (exact !== candidate.locator && (await resolveLocator(page, exact).count()) === 1) return exact;

  if (candidate.backendNodeId === undefined) return null;
  const index = await withMarkedElement(page, candidate.backendNodeId, () =>
    resolveLocator(page, exact).evaluateAll((els) => els.findIndex((el) => el.hasAttribute('data-jev-pick'))),
  );
  return index >= 0 ? `${exact}.nth(${index})` : null;
}
