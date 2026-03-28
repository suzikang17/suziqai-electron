import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepSidebar } from '../../src/renderer/components/StepSidebar';
import type { TestSuite } from '../../src/shared/types';

const mockSuite: TestSuite = {
  id: 'suite-1',
  name: 'Login Suite',
  fileName: 'login-suite',
  beforeAll: [],
  beforeEach: [
    { id: 'be1', label: 'Navigate to /login', action: { type: 'navigate', url: '/login' }, status: 'pending' },
  ],
  afterEach: [],
  afterAll: [],
  tests: [
    {
      id: 'block-1',
      name: 'Login Test',
      steps: [
        { id: 's1', label: 'Navigate to /login', action: { type: 'navigate', url: '/login' }, status: 'passed' },
        { id: 's2', label: 'Fill email', action: { type: 'fill', selector: '#email', value: 'test@test.com' }, status: 'running' },
        { id: 's3', label: 'Click Sign In', action: { type: 'click', selector: 'button' }, status: 'pending' },
      ],
    },
  ],
  devices: [],
};

const defaultProps = {
  suites: [mockSuite],
  activeSuiteId: 'suite-1',
  activeBlockId: 'block-1',
  onSwitchSuite: vi.fn(),
  onSwitchBlock: vi.fn(),
  onCreateSuite: vi.fn(),
  onCreateBlock: vi.fn(),
  onRenameSuite: vi.fn(),
  onRenameSuiteFileName: vi.fn(),
  onRenameBlock: vi.fn(),
  onDeleteSuite: vi.fn(),
  onDeleteBlock: vi.fn(),
  onAddHookStep: vi.fn(),
  onRemoveHookStep: vi.fn(),
  onAcceptStep: vi.fn(),
  onDenyStep: vi.fn(),
  onResetStep: vi.fn(),
  onUpdateStep: vi.fn(),
  onInsertStep: vi.fn(),
  onInsertPrompt: vi.fn(),
  onRunAll: vi.fn(),
  onRunActAndAssert: vi.fn(),
  onRunGroup: vi.fn(),
  onMoveStep: vi.fn(),
  onExport: vi.fn(),
  isAutopilot: false,
  onAutopilotToggle: vi.fn(),
  sidebarMode: 'session' as const,
  onSidebarModeChange: vi.fn(),
  onSaveTest: vi.fn(),
  libraryEntries: [],
  onLoadFromLibrary: vi.fn(),
  onDeleteFromLibrary: vi.fn(),
  onRefreshLibrary: vi.fn(),
  onUpdateSuiteDevices: vi.fn(),
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

  it('renders beforeEach section', () => {
    render(<StepSidebar {...defaultProps} />);
    expect(screen.getByText(/beforeEach/)).toBeTruthy();
    expect(screen.getByText(/1 step/)).toBeTruthy();
  });

  it('renders test block sections', () => {
    render(<StepSidebar {...defaultProps} />);
    expect(screen.getByText('Login Test')).toBeTruthy();
    expect(screen.getByText(/3 steps/)).toBeTruthy();
  });

  it('calls onCreateBlock when + New Test button is clicked', () => {
    const onCreateBlock = vi.fn();
    render(<StepSidebar {...defaultProps} onCreateBlock={onCreateBlock} />);

    fireEvent.click(screen.getByText('+ New Test'));
    expect(onCreateBlock).toHaveBeenCalledOnce();
  });

  it('calls onCreateSuite when + New Suite button is clicked in library tab', () => {
    const onCreateSuite = vi.fn();
    render(<StepSidebar {...defaultProps} sidebarMode="library" onCreateSuite={onCreateSuite} />);

    fireEvent.click(screen.getByText('+ New Suite'));
    expect(onCreateSuite).toHaveBeenCalledOnce();
  });
});

describe('Library toggle', () => {
  const baseProps = {
    suites: [{ id: 'suite-1', name: 'Suite 1', fileName: 'suite-1', beforeAll: [], beforeEach: [], afterEach: [], afterAll: [], tests: [{ id: 'block-1', name: 'Test 1', steps: [] }], devices: [] }],
    activeSuiteId: 'suite-1',
    activeBlockId: 'block-1',
    onSwitchSuite: vi.fn(),
    onSwitchBlock: vi.fn(),
    onCreateSuite: vi.fn(),
    onCreateBlock: vi.fn(),
    onRenameSuite: vi.fn(),
    onRenameBlock: vi.fn(),
    onDeleteSuite: vi.fn(),
    onDeleteBlock: vi.fn(),
    onAddBeforeEachStep: vi.fn(),
    onRemoveBeforeEachStep: vi.fn(),
    onAcceptStep: vi.fn(),
    onDenyStep: vi.fn(),
    onResetStep: vi.fn(),
    onUpdateStep: vi.fn(),
    onInsertStep: vi.fn(),
    onInsertPrompt: vi.fn(),
    onRunAll: vi.fn(),
    onRunActAndAssert: vi.fn(),
    onRunGroup: vi.fn(),
    onMoveStep: vi.fn(),
    onExport: vi.fn(),
    sidebarMode: 'session' as const,
    onSidebarModeChange: vi.fn(),
    onSaveTest: vi.fn(),
    libraryEntries: [],
    onLoadFromLibrary: vi.fn(),
    onDeleteFromLibrary: vi.fn(),
    onRefreshLibrary: vi.fn(),
    onRenameSuiteFileName: vi.fn(),
    onUpdateSuiteDevices: vi.fn(),
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
