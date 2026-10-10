// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { runGoal, needsApproval, type GoalDeps, type PlanDecision, type PlannedStep } from '../../src/main/goal-autopilot';

const click = (label: string): PlannedStep => ({ label, action: { type: 'click', selector: label } });
const check = (label: string): PlannedStep => ({ label, action: { type: 'assert', assertionType: 'visible', expected: '', selector: label } });

/** Deps whose planner returns the given decisions in order, and whose executor fails the listed labels once. */
function deps(decisions: PlanDecision[], failOnce: string[] = []): GoalDeps & { executed: string[]; planned: any[] } {
  const failing = new Set(failOnce);
  const executed: string[] = [];
  const planned: any[] = [];
  return {
    executed,
    planned,
    freshStart: vi.fn(async () => {}),
    observe: vi.fn(async () => ({ url: 'app://x', screen: 'screen text', screenshot: Buffer.alloc(0) })),
    plan: vi.fn(async (input) => { planned.push(input); return decisions.shift() ?? { status: 'stuck', message: 'no more plans', steps: [] }; }),
    execute: vi.fn(async (step) => {
      executed.push(step.label);
      if (failing.has(step.label)) { failing.delete(step.label); return { ok: false, error: `${step.label} not found` }; }
      return { ok: true, ...(step.label === 'Add' ? { resolvedSelector: 'resolved:add' } : {}) };
    }),
    emit: vi.fn(),
  };
}

describe('runGoal', () => {
  it('plans from each new screen until done, then verifies with a fresh replay', async () => {
    const d = deps([
      { status: 'continue', message: 'go to care team', steps: [click('Care Team')] },
      { status: 'continue', message: 'add', steps: [click('Add')] },
      { status: 'done', message: 'saved', steps: [check('Dr. Paws')] },
    ]);
    const result = await runGoal('Add a vet', d, { maxSteps: 25, maxConsecutiveFailures: 3 });

    expect(result.status).toBe('done');
    expect(result.verified).toBe(true);
    expect(result.steps.map((s) => s.label)).toEqual(['Care Team', 'Add', 'Dr. Paws']);
    // resolved selectors are kept, so the saved test uses what actually worked
    expect(result.steps[1].action).toEqual({ type: 'click', selector: 'resolved:add' });
    // the planner saw the goal and what was already done
    expect(d.planned[2]).toMatchObject({ goal: 'Add a vet', done: ['Care Team', 'Add'] });
    // starts fresh, and again for the verification replay
    expect(d.freshStart).toHaveBeenCalledTimes(2);
    expect(d.executed).toEqual(['Care Team', 'Add', 'Dr. Paws', 'Care Team', 'Add', 'Dr. Paws']);
  });

  it('drops failed attempts, tells the planner why, and keeps only what worked', async () => {
    const d = deps([
      { status: 'continue', message: 'try save', steps: [click('Save'), click('Never reached')] },
      { status: 'continue', message: 'other way', steps: [click('Done')] },
      { status: 'done', message: 'ok', steps: [] },
    ], ['Save']);
    const result = await runGoal('Finish', d, { maxSteps: 25, maxConsecutiveFailures: 3 });

    expect(result.status).toBe('done');
    expect(result.steps.map((s) => s.label)).toEqual(['Done']);
    expect(d.executed.slice(0, 2)).toEqual(['Save', 'Done']); // the rest of a failed batch is skipped
    expect(d.planned[1].lastError).toBe('"Save" failed: Save not found');
  });

  it('stops as stuck after too many failures in a row', async () => {
    const d = deps([
      { status: 'continue', message: '', steps: [click('A')] },
      { status: 'continue', message: '', steps: [click('B')] },
      { status: 'continue', message: '', steps: [click('C')] },
    ], ['A', 'B', 'C']);
    const result = await runGoal('x', d, { maxSteps: 25, maxConsecutiveFailures: 3 });
    expect(result.status).toBe('stuck');
    expect(result.message).toMatch(/3 failed attempts in a row/);
  });

  it('stops at the step budget', async () => {
    const d = deps(Array.from({ length: 10 }, (_, i) => ({ status: 'continue' as const, message: '', steps: [click(`s${i}`)] })));
    const result = await runGoal('x', d, { maxSteps: 3, maxConsecutiveFailures: 3 });
    expect(result.status).toBe('stuck');
    expect(result.message).toMatch(/3-step budget/);
    expect(result.steps).toHaveLength(3);
  });

  it('reports the planner giving up', async () => {
    const result = await runGoal('x', deps([{ status: 'stuck', message: 'There is no Add button', steps: [] }]), { maxSteps: 25, maxConsecutiveFailures: 3 });
    expect(result).toMatchObject({ status: 'stuck', message: 'There is no Add button', verified: false });
  });

  it('marks the result unverified when the fresh replay fails', async () => {
    const d = deps([{ status: 'continue', message: '', steps: [click('A')] }, { status: 'done', message: '', steps: [] }]);
    let runs = 0;
    d.execute = vi.fn(async () => (++runs === 2 ? { ok: false, error: 'flaky' } : { ok: true }));
    const result = await runGoal('x', d, { maxSteps: 25, maxConsecutiveFailures: 3 });
    expect(result.status).toBe('done');
    expect(result.verified).toBe(false);
    expect(result.message).toMatch(/replay failed at "A": flaky/);
  });

  it('asks for approval before data-changing steps, and stops if declined', async () => {
    const d = deps([{ status: 'continue', message: '', steps: [click('Delete job order')] }]);
    d.approve = vi.fn(async () => false);
    const result = await runGoal('x', d, { maxSteps: 25, maxConsecutiveFailures: 3, requireApproval: true });
    expect(d.approve).toHaveBeenCalledOnce();
    expect(d.executed).toEqual([]);
    expect(result).toMatchObject({ status: 'stuck', message: expect.stringMatching(/declined/) });
  });

  it('can be stopped', async () => {
    const controller = new AbortController();
    const d = deps([{ status: 'continue', message: '', steps: [click('A')] }, { status: 'continue', message: '', steps: [click('B')] }]);
    d.execute = vi.fn(async () => { controller.abort(); return { ok: true }; });
    const result = await runGoal('x', d, { maxSteps: 25, maxConsecutiveFailures: 3, signal: controller.signal });
    expect(result.status).toBe('stopped');
  });
});

describe('runGoal setup', () => {
  it('runs the suite setup after each fresh start without keeping it, and stops if it fails', async () => {
    const login = { id: 'login', label: 'Log in', action: { type: 'click' as const, selector: 'login' } };
    const d = deps([{ status: 'continue', message: '', steps: [click('A')] }, { status: 'done', message: '', steps: [] }]);
    const result = await runGoal('x', d, { maxSteps: 25, maxConsecutiveFailures: 3, setup: [login] });
    expect(result.steps.map((s) => s.label)).toEqual(['A']);
    expect(d.executed).toEqual(['Log in', 'A', 'Log in', 'A']);

    const failing = deps([{ status: 'continue', message: '', steps: [click('A')] }], ['Log in']);
    const r2 = await runGoal('x', failing, { maxSteps: 25, maxConsecutiveFailures: 3, setup: [login] });
    expect(r2).toMatchObject({ status: 'stuck', message: expect.stringMatching(/Setup step "Log in" failed/) });
    expect(failing.executed).toEqual(['Log in']);
  });
});

describe('needsApproval', () => {
  it('flags steps that look like they change data', () => {
    expect(needsApproval(click('Save changes'))).toBe(true);
    expect(needsApproval({ label: 'Submit the form', action: { type: 'click', selector: "getByRole('button', { name: 'Go' })" } })).toBe(true);
    expect(needsApproval({ label: 'x', action: { type: 'press', selector: 'input', key: 'Enter' } })).toBe(true);
    expect(needsApproval(click('Next week'))).toBe(false);
    expect(needsApproval(click('Cancel the dialog'))).toBe(false);
    expect(needsApproval(click("Cancel this group's shifts"))).toBe(true);
    expect(needsApproval(check('Delete button is visible'))).toBe(false);
    expect(needsApproval({ label: 'Type name', action: { type: 'fill', selector: 'x', value: 'y' } })).toBe(false);
  });
});
