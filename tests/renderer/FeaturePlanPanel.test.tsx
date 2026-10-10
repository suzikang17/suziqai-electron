import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeaturePlanPanel } from '../../src/renderer/components/FeaturePlanPanel';
import type { FeaturePlan } from '../../src/shared/types';

const plan: FeaturePlan = {
  feature: 'care team',
  summary: 'Vets can be added.',
  scenarios: [
    { id: 'sc-1', name: 'Add a vet', kind: 'happy', goal: 'Add a vet and check it appears', preconditions: '', data: '', expected: '1 vet', writes: true, runnable: 'now' },
    { id: 'sc-2', name: 'Delete a vet', kind: 'edge', goal: 'Delete the vet', preconditions: '', data: '', expected: 'empty', writes: true, runnable: 'needs-sandbox' },
  ],
};

describe('FeaturePlanPanel', () => {
  it('pre-selects runnable scenarios, disables ones needing a sandbox, and runs the selection', () => {
    const onRun = vi.fn();
    render(<FeaturePlanPanel plan={plan} statuses={{}} running={false} onRun={onRun} onDiscard={vi.fn()} />);

    expect(screen.getByText('Test plan: care team')).toBeDefined();
    expect(screen.getByText(/needs a sandbox/)).toBeDefined();
    const add = screen.getByLabelText('Run Add a vet') as HTMLInputElement;
    const del = screen.getByLabelText('Run Delete a vet') as HTMLInputElement;
    expect(add.checked).toBe(true);
    expect(del.checked).toBe(false);
    expect(del.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Run 1 selected' }));
    expect(onRun).toHaveBeenCalledWith(['sc-1']);
  });

  it('shows each scenario status', () => {
    render(<FeaturePlanPanel plan={plan} statuses={{ 'sc-1': 'verified', 'sc-2': 'needs-sandbox' }} running={false} onRun={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByText('✅ verified')).toBeDefined();
    expect(screen.getByText('🏖 needs a sandbox')).toBeDefined();
  });
});
