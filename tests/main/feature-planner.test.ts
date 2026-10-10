// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseFeaturePlan, foldPreconditions } from '../../src/main/feature-planner';

const reply = `Here is the plan:
\`\`\`json
{
  "summary": "Job orders are created from the Schedule Board.",
  "scenarios": [
    { "name": "Open New Job Order", "kind": "happy", "goal": "Open the New Job Order dialog and check the title field is visible.", "preconditions": "Logged in as admin", "data": "", "expected": "dialog visible", "writes": false },
    { "name": "Create a draft", "kind": "happy", "goal": "Create a job order titled QA Test and check it appears as Draft.", "preconditions": "", "data": "title QA Test", "expected": "Draft pill", "writes": true, "notes": "cleanup after" },
    { "name": "Recruiter cannot see wages", "kind": "permission", "goal": "As a recruiter open Edit Job Order and check there is no Wage column.", "preconditions": "recruiter account", "data": "", "expected": "no wage", "writes": false },
    { "goal": "" }
  ]
}
\`\`\``;

describe('parseFeaturePlan', () => {
  it('extracts scenarios, ids them, and marks writes as needs-sandbox on read-only apps', () => {
    const plan = parseFeaturePlan(reply, 'job orders', true);
    expect(plan.feature).toBe('job orders');
    expect(plan.summary).toMatch(/Schedule Board/);
    expect(plan.scenarios.map((s) => [s.id, s.kind, s.runnable])).toEqual([
      ['sc-1', 'happy', 'now'],
      ['sc-2', 'happy', 'needs-sandbox'],
      ['sc-3', 'permission', 'now'],
    ]);
    expect(plan.scenarios[1].notes).toBe('cleanup after');
  });

  it('lets write scenarios run when the app is not read-only', () => {
    expect(parseFeaturePlan(reply, 'x', false).scenarios.map((s) => s.runnable)).toEqual(['now', 'now', 'now']);
  });

  it('folds non-trivial preconditions into the goal, since every scenario starts fresh', () => {
    expect(foldPreconditions('Tap the row for Dr. Sarah Chen and change the clinic to Green Valley.', 'A vet named Dr. Sarah Chen exists.')).toEqual({
      goal: 'First, a vet named Dr. Sarah Chen exists. Then Tap the row for Dr. Sarah Chen and change the clinic to Green Valley.',
      rawGoal: 'Tap the row for Dr. Sarah Chen and change the clinic to Green Valley.',
    });
    // harness-provided preconditions and goals that already set themselves up are left alone
    expect(foldPreconditions('Open the board.', 'Logged in as admin')).toEqual({ goal: 'Open the board.' });
    expect(foldPreconditions('Open the board.', 'none')).toEqual({ goal: 'Open the board.' });
    expect(foldPreconditions('Add a vet named Dr. X, then edit it.', 'A vet exists')).toEqual({ goal: 'Add a vet named Dr. X, then edit it.' });

    const plan = parseFeaturePlan(JSON.stringify({ scenarios: [
      { name: 'Edit', goal: 'Change the clinic to Green Valley and check it shows.', preconditions: 'A vet named Dr. Sarah Chen exists', writes: true },
    ] }), 'x', false);
    expect(plan.scenarios[0].goal).toMatch(/^First, a vet named Dr\. Sarah Chen exists\. Then Change/);
    expect(plan.scenarios[0].rawGoal).toBe('Change the clinic to Green Valley and check it shows.');
  });

  it('fails clearly on a non-plan reply', () => {
    expect(() => parseFeaturePlan('I could not find that feature.', 'x', false)).toThrow(/did not return a plan/);
    expect(() => parseFeaturePlan('{ "scenarios": [] }', 'x', false)).toThrow(/no runnable scenarios/);
  });
});
