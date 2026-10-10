import { query } from '@anthropic-ai/claude-agent-sdk';

// Feature layer: turn "test the job orders feature" into a reviewed list of scenarios, each a
// single goal the goal autopilot can run. Claude may read the project's source (read-only
// tools) to learn routes, validation, statuses, side effects and permissions.

import type { FeaturePlan, Scenario } from '../shared/types';
import { extractJson } from './json-reply';
export type { FeaturePlan, Scenario };

export interface PlanFeatureInput {
  feature: string;
  /** Project root; when set, Claude reads its code with Read/Grep/Glob. */
  projectPath?: string;
  platform: 'web' | 'ios';
  /** Production in read-only mode: write scenarios are listed but marked needs-sandbox. */
  readOnly: boolean;
  url: string;
  screen: string;
}

const PLANNER_PROMPT = `You are a senior QA engineer writing a test plan for ONE feature of an app. Each scenario will be executed by an autonomous agent that drives the real app one goal at a time, so every scenario must be phrased as a goal the agent can pursue and verify on screen.

If you have file tools, read the project's source first to learn the feature's routes/screens, form fields and validation, statuses and transitions, side effects (emails, SMS, external systems) and role permissions. Spend most of your effort there; keep tool use focused on this feature.

IMPORTANT: EVERY scenario runs from a FRESH app start, with NO data left over from any other scenario (the store is reset; nothing created by an earlier scenario exists). So each goal must create whatever it needs first, inside the same goal — e.g. "Add a vet named Dr. Sarah Chen, then open that vet and change the clinic to Green Valley, and check the row shows Green Valley". "preconditions" may only list things the agent can establish itself within that goal (never "a vet already exists"), and the goal text must include doing them.

Produce 4-8 scenarios, ordered simplest first, covering: the main happy paths, the important edge cases (validation, empty states, cancel/undo), and permissions where roles differ. Prefer scenarios a real user cares about.

Each goal must be:
- one self-contained imperative sentence, starting from the app's home screen after login (the agent handles login),
- including any setup it depends on (create the data first, then act on it),
- concrete (name the screens, buttons and values to use),
- ending with the observable check that proves it ("…and check that X is visible / shows Y").

Set "writes": true for anything that creates, changes or deletes data, or sends messages/notifications.

Respond with ONLY this JSON (no markdown fences):
{
  "summary": "one or two sentences on what the feature does and what the plan covers",
  "scenarios": [
    { "name": "short title", "kind": "happy" | "edge" | "permission", "goal": "…", "preconditions": "…", "data": "…", "expected": "…", "writes": true | false, "notes": "optional" }
  ]
}`;

/** Preconditions the test harness already provides (fresh start, login) — nothing to fold in. */
const TRIVIAL_PRECONDITION = /^(none|n\/a|-|logged in|user is logged in|app (is )?open|app (is )?launched|(a )?(fresh|clean|new) (app|start|install|launch)\b(?!.*\b(with|has|containing)\b(?!\s+no\b)))/i;
/** Goals that already begin with their own setup. */
const SETUP_LEAD = /^(first|start by|begin by|after |having |once |add |create |set up|setup)/i;
/** Preconditions phrased as states ("A vet exists") read better lower-cased after "First,". */
const LOWERCASE_LEAD = /^(A|An|The|There|User|You|It|One|Some|No|At)\b/;

/**
 * Every scenario runs from a fresh start, so a precondition the planner listed separately must
 * become part of the goal, or the agent will find nothing to act on.
 */
export function foldPreconditions(goal: string, preconditions: string): { goal: string; rawGoal?: string } {
  const pre = preconditions.trim().replace(/[.\s]+$/, '');
  if (!pre || TRIVIAL_PRECONDITION.test(pre) || SETUP_LEAD.test(goal)) return { goal };
  const lead = LOWERCASE_LEAD.test(pre) ? pre[0].toLowerCase() + pre.slice(1) : pre;
  return { goal: `First, ${lead}. Then ${goal}`, rawGoal: goal };
}

/** Parses the planner's reply; throws a readable error if it isn't a plan. */
export function parseFeaturePlan(raw: string, feature: string, readOnly: boolean): FeaturePlan {
  const parsed = extractJson<{ summary?: string; scenarios?: Array<Partial<Scenario>> }>(raw, (v) => Array.isArray(v.scenarios));
  if (!parsed) throw new Error('The planner did not return a plan: ' + raw.slice(0, 200));
  const scenarios = (parsed.scenarios ?? [])
    .filter((s) => s && typeof s.goal === 'string' && s.goal.trim())
    .map((s, i): Scenario => {
      const writes = !!s.writes;
      const preconditions = s.preconditions ?? '';
      const { goal, rawGoal } = foldPreconditions(s.goal!.trim(), preconditions);
      return {
        id: `sc-${i + 1}`,
        name: (s.name ?? `Scenario ${i + 1}`).trim(),
        kind: s.kind === 'edge' || s.kind === 'permission' ? s.kind : 'happy',
        goal,
        ...(rawGoal ? { rawGoal } : {}),
        preconditions,
        data: s.data ?? '',
        expected: s.expected ?? '',
        writes,
        runnable: writes && readOnly ? 'needs-sandbox' : 'now',
        ...(s.notes ? { notes: s.notes } : {}),
      };
    });
  if (scenarios.length === 0) throw new Error('The planner returned no runnable scenarios');
  return { feature, summary: parsed.summary ?? '', scenarios };
}

export async function planFeature(input: PlanFeatureInput): Promise<FeaturePlan> {
  const prompt = [
    `Feature to test: ${input.feature}`,
    `Platform: ${input.platform === 'ios' ? 'iOS app on a simulator' : 'web app'}.`,
    input.readOnly
      ? 'IMPORTANT: this is PRODUCTION in read-only mode. Scenarios that write cannot run here; still list the important ones (they will be marked "needs a sandbox"), but make most scenarios meaningful without writing: navigation, filters, views, dialogs opened and then cancelled, validation that disables a button, permissions.'
      : 'Writes are allowed (test data store).',
    input.projectPath ? `Project source is in the current directory (${input.projectPath}); read it.` : 'No source code is available; plan from the screen and the description.',
    `[Current page: ${input.url}]`,
    `[Current screen: ${input.screen.slice(0, 6000)}]`,
  ].join('\n\n');

  let result = '';
  const canRead = !!input.projectPath;
  for await (const message of query({
    prompt,
    options: {
      systemPrompt: PLANNER_PROMPT,
      ...(canRead ? { cwd: input.projectPath } : {}),
      allowedTools: canRead ? ['Read', 'Grep', 'Glob'] : [],
      disallowedTools: ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent'],
      maxTurns: canRead ? 30 : 1,
    },
  })) {
    if ('result' in message && message.type === 'result') result = (message as { result?: string }).result ?? '';
  }
  return parseFeaturePlan(result, input.feature, input.readOnly);
}
