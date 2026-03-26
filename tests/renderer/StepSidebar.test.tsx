import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepSidebar } from '../../src/renderer/components/StepSidebar';
import type { TestCase } from '../../src/shared/types';

const mockTest: TestCase = {
  id: '1',
  name: 'Login Test',
  steps: [
    { id: 's1', label: 'Navigate to /login', action: { type: 'navigate', url: '/login' }, status: 'passed' },
    { id: 's2', label: 'Fill email', action: { type: 'fill', selector: '#email', value: 'test@test.com' }, status: 'running' },
    { id: 's3', label: 'Click Sign In', action: { type: 'click', selector: 'button' }, status: 'pending' },
  ],
};

describe('StepSidebar', () => {
  it('renders all steps with correct status indicators', () => {
    render(
      <StepSidebar
        testCase={mockTest}
        onAcceptStep={vi.fn()}
        onDenyStep={vi.fn()}
        onRunAll={vi.fn()}
        onExport={vi.fn()}
      />
    );

    expect(screen.getByText('Navigate to /login')).toBeTruthy();
    expect(screen.getByText('Fill email')).toBeTruthy();
    expect(screen.getByText('Click Sign In')).toBeTruthy();
  });

  it('calls onRunAll when Run All button is clicked', () => {
    const onRunAll = vi.fn();
    render(
      <StepSidebar
        testCase={mockTest}
        onAcceptStep={vi.fn()}
        onDenyStep={vi.fn()}
        onRunAll={onRunAll}
        onExport={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Run All'));
    expect(onRunAll).toHaveBeenCalledOnce();
  });

  it('calls onExport when Export button is clicked', () => {
    const onExport = vi.fn();
    render(
      <StepSidebar
        testCase={mockTest}
        onAcceptStep={vi.fn()}
        onDenyStep={vi.fn()}
        onRunAll={vi.fn()}
        onExport={onExport}
      />
    );

    fireEvent.click(screen.getByText('Export .spec.ts'));
    expect(onExport).toHaveBeenCalledOnce();
  });
});
