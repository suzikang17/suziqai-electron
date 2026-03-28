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

const defaultProps = {
  tests: [mockTest],
  activeTestId: '1',
  onSwitchTest: vi.fn(),
  onCreateTest: vi.fn(),
  onRenameTest: vi.fn(),
  onDeleteTest: vi.fn(),
  onAcceptStep: vi.fn(),
  onDenyStep: vi.fn(),
  onResetStep: vi.fn(),
  onUpdateStep: vi.fn(),
  onInsertStep: vi.fn(),
  onInsertPrompt: vi.fn(),
  onRunAll: vi.fn(),
  onRunActAndAssert: vi.fn(),
  onRunGroup: vi.fn(),
  onExport: vi.fn(),
  sidebarMode: 'session' as const,
  onSidebarModeChange: vi.fn(),
  onSaveTest: vi.fn(),
  libraryEntries: [],
  onLoadFromLibrary: vi.fn(),
  onDeleteFromLibrary: vi.fn(),
  onRefreshLibrary: vi.fn(),
};

describe('StepSidebar', () => {
  it('renders all steps with correct status indicators', () => {
    render(<StepSidebar {...defaultProps} />);

    expect(screen.getByText('Navigate to /login')).toBeTruthy();
    expect(screen.getByText('Fill email')).toBeTruthy();
    expect(screen.getByText('Click Sign In')).toBeTruthy();
  });

  it('calls onRunAll when Run All button is clicked', () => {
    const onRunAll = vi.fn();
    render(<StepSidebar {...defaultProps} onRunAll={onRunAll} />);

    fireEvent.click(screen.getByText('Run All'));
    expect(onRunAll).toHaveBeenCalledOnce();
  });

  it('calls onSaveTest when Save to Library button is clicked', () => {
    const onSaveTest = vi.fn();
    render(<StepSidebar {...defaultProps} onSaveTest={onSaveTest} />);

    fireEvent.click(screen.getByText('Save to Library'));
    expect(onSaveTest).toHaveBeenCalledOnce();
  });
});

describe('Library toggle', () => {
  const baseProps = {
    tests: [{ id: '1', name: 'Test 1', steps: [] }],
    activeTestId: '1',
    onSwitchTest: vi.fn(),
    onCreateTest: vi.fn(),
    onRenameTest: vi.fn(),
    onDeleteTest: vi.fn(),
    onAcceptStep: vi.fn(),
    onDenyStep: vi.fn(),
    onResetStep: vi.fn(),
    onUpdateStep: vi.fn(),
    onInsertStep: vi.fn(),
    onInsertPrompt: vi.fn(),
    onRunAll: vi.fn(),
  onRunActAndAssert: vi.fn(),
  onRunGroup: vi.fn(),
    onExport: vi.fn(),
    sidebarMode: 'session' as const,
    onSidebarModeChange: vi.fn(),
    onSaveTest: vi.fn(),
    libraryEntries: [],
    onLoadFromLibrary: vi.fn(),
    onDeleteFromLibrary: vi.fn(),
    onRefreshLibrary: vi.fn(),
  };

  it('renders Session and Library tabs', () => {
    render(<StepSidebar {...baseProps} />);
    expect(screen.getByText('Session')).toBeDefined();
    expect(screen.getByText('Library')).toBeDefined();
  });

  it('calls onSidebarModeChange when clicking Library tab', () => {
    render(<StepSidebar {...baseProps} />);
    fireEvent.click(screen.getByText('Library'));
    expect(baseProps.onSidebarModeChange).toHaveBeenCalledWith('library');
  });

  it('shows library view when sidebarMode is library', () => {
    render(<StepSidebar {...baseProps} sidebarMode="library" />);
    expect(screen.getByText(/no saved tests/i)).toBeDefined();
  });

  it('renders Save to Library button in session mode', () => {
    render(<StepSidebar {...baseProps} />);
    expect(screen.getByText('Save to Library')).toBeDefined();
  });

  it('calls onSaveTest when clicking Save to Library', () => {
    render(<StepSidebar {...baseProps} />);
    fireEvent.click(screen.getByText('Save to Library'));
    expect(baseProps.onSaveTest).toHaveBeenCalled();
  });
});
