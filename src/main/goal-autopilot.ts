import { randomUUID } from 'crypto';
import type { StepAction } from '../shared/types';

// Goal-driven autopilot: observe the screen → ask Claude for the next steps toward the goal →
// run them (Jev resolves elements) → repeat until Claude says the goal is met, it gives up, a
// budget runs out, or the user stops it. Only steps that succeeded are kept, and the kept
// steps are replayed once from a fresh start before the goal counts as done.

export interface PlannedStep {
  id?: string;
  label: string;
  action: StepAction;
}

export interface PlanDecision {
  /** continue: more steps to take; done: goal met (steps = closing assertions); stuck: can't proceed */
  status: 'continue' | 'done' | 'stuck';
  message: string;
  steps: PlannedStep[];
}

export interface Observation {
  url: string;
  /** The screen as text: accessibility tree (web) or element list (iOS). */
  screen: string;
  screenshot: Buffer;
}

export interface PlanInput extends Observation {
  goal: string;
  /** Labels of the steps that have succeeded so far. */
  done: string[];
  /** Why the previous attempt failed, if it did. */
  lastError?: string;
  round: number;
}

export interface ExecResult {
  ok: boolean;
  error?: string;
  /** Set when the element was (re)resolved; the kept step uses it. */
  resolvedSelector?: string;
}

export type GoalPhase = 'explore' | 'verify';

export type GoalEvent =
  | { type: 'round'; round: number; message: string; status: PlanDecision['status'] }
  | { type: 'step'; phase: GoalPhase; step: PlannedStep; ok: boolean; error?: string }
  | { type: 'verify'; ok: boolean; error?: string };

export interface GoalDeps {
  /** Fresh session (cleared storage / relaunched app), like the start of a CI test. */
  freshStart(): Promise<void>;
  observe(): Promise<Observation>;
  plan(input: PlanInput): Promise<PlanDecision>;
  execute(step: PlannedStep, phase: GoalPhase): Promise<ExecResult>;
  /** Asked before data-changing steps when options.requireApproval is set; false stops the run. */
  approve?(step: PlannedStep): Promise<boolean>;
  emit(event: GoalEvent): void;
}

export interface GoalOptions {
  /** The suite's beforeAll/beforeEach steps (e.g. login): run after every fresh start, not kept. */
  setup?: PlannedStep[];
  maxSteps: number;
  maxConsecutiveFailures: number;
  requireApproval?: boolean;
  signal?: AbortSignal;
}

export interface GoalResult {
  status: 'done' | 'stuck' | 'stopped';
  message: string;
  /** The steps that worked, in order — what gets saved as the test. */
  steps: PlannedStep[];
  /** done, and the fresh replay passed. */
  verified: boolean;
  rounds: number;
}

const DATA_CHANGING = /\b(save|submit|delete|remove|send|create|update|confirm|publish|transfer|apply|approve|archive|pay|purchase|checkout|post|cancel\s+(this|all|my|the\s+(?!dialog\b|modal\b|popup\b|form\b|edit\b)\w+))/i;

/** Steps that look like they change data (used on apps that aren't read-only). */
export function needsApproval(step: PlannedStep): boolean {
  const a = step.action;
  if (a.type === 'press') return a.key === 'Enter';
  if (a.type !== 'click') return false;
  return DATA_CHANGING.test(`${step.label} ${a.selector}`);
}

export async function runGoal(goal: string, deps: GoalDeps, options: GoalOptions): Promise<GoalResult> {
  const { signal } = options;
  const kept: PlannedStep[] = [];
  let consecutiveFailures = 0;
  let lastError: string | undefined;
  let round = 0;
  const stopped = (): GoalResult => ({ status: 'stopped', message: 'Stopped', steps: kept, verified: false, rounds: round });
  const stuck = (message: string): GoalResult => ({ status: 'stuck', message, steps: kept, verified: false, rounds: round });

  /** Fresh start plus the suite's setup steps, exactly as a test run would begin. */
  const prepare = async (phase: GoalPhase): Promise<string | null> => {
    await deps.freshStart();
    for (const step of options.setup ?? []) {
      const result = await deps.execute(step, phase);
      if (!result.ok) return `Setup step "${step.label}" failed: ${result.error ?? 'unknown error'}`;
    }
    return null;
  };

  const setupError = await prepare('explore');
  if (setupError) return stuck(setupError);

  for (;;) {
    if (signal?.aborted) return stopped();
    if (kept.length >= options.maxSteps) return stuck(`Reached the ${options.maxSteps}-step budget before the goal was met`);

    round++;
    const observation = await deps.observe();
    const decision = await deps.plan({ ...observation, goal, done: kept.map((s) => s.label), lastError, round });
    deps.emit({ type: 'round', round, message: decision.message, status: decision.status });
    if (decision.status === 'stuck') return stuck(decision.message || 'The planner could not find a way forward');

    let batchFailed = false;
    for (const planned of decision.steps) {
      if (signal?.aborted) return stopped();
      if (kept.length >= options.maxSteps) return stuck(`Reached the ${options.maxSteps}-step budget before the goal was met`);
      const step: PlannedStep = { ...planned, id: planned.id ?? `goal-${randomUUID()}` };

      if (options.requireApproval && needsApproval(step)) {
        const approved = await (deps.approve ?? (async () => false))(step);
        if (!approved) return stuck(`Stopped: approval declined for "${step.label}"`);
      }

      const result = await deps.execute(step, 'explore');
      deps.emit({ type: 'step', phase: 'explore', step, ok: result.ok, error: result.error });
      if (!result.ok) {
        consecutiveFailures++;
        lastError = `"${step.label}" failed: ${result.error ?? 'unknown error'}`;
        batchFailed = true;
        break; // the rest of this batch assumed this step worked
      }
      consecutiveFailures = 0;
      lastError = undefined;
      kept.push(
        result.resolvedSelector && 'selector' in step.action
          ? { ...step, action: { ...step.action, selector: result.resolvedSelector } as StepAction }
          : step,
      );
    }

    if (consecutiveFailures >= options.maxConsecutiveFailures) {
      return stuck(`${consecutiveFailures} failed attempts in a row; last: ${lastError}`);
    }
    if (decision.status === 'done' && !batchFailed) break;
  }

  // Prove it: the kept steps must pass on their own from a fresh start
  const verifySetupError = await prepare('verify');
  if (verifySetupError) {
    deps.emit({ type: 'verify', ok: false, error: verifySetupError });
    return { status: 'done', message: `Goal reached, but the fresh replay could not start: ${verifySetupError}`, steps: kept, verified: false, rounds: round };
  }
  for (const step of kept) {
    if (signal?.aborted) return stopped();
    const result = await deps.execute(step, 'verify');
    deps.emit({ type: 'step', phase: 'verify', step, ok: result.ok, error: result.error });
    if (!result.ok) {
      deps.emit({ type: 'verify', ok: false, error: result.error });
      return {
        status: 'done',
        message: `Goal reached, but a fresh replay failed at "${step.label}": ${result.error ?? 'unknown error'}`,
        steps: kept,
        verified: false,
        rounds: round,
      };
    }
  }
  deps.emit({ type: 'verify', ok: true });
  return { status: 'done', message: 'Goal reached and verified with a fresh replay', steps: kept, verified: true, rounds: round };
}
