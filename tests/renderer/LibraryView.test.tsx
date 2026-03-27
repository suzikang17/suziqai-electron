import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibraryView } from '../../src/renderer/components/LibraryView';
import type { LibraryEntry } from '../../src/shared/types';

describe('LibraryView', () => {
  const mockEntries: LibraryEntry[] = [
    { fileName: 'login-flow', name: 'Login flow', stepCount: 3, savedAt: '2026-03-27T10:00:00Z', updatedAt: '2026-03-27T10:00:00Z', imported: false },
    { fileName: 'legacy-test', name: 'legacy-test', stepCount: 0, savedAt: '', updatedAt: '', imported: true },
  ];

  it('renders a list of saved tests', () => {
    render(<LibraryView entries={mockEntries} onLoad={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText('Login flow')).toBeDefined();
    expect(screen.getByText('legacy-test')).toBeDefined();
  });

  it('shows step count for entries with sidecars', () => {
    render(<LibraryView entries={mockEntries} onLoad={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText('3 steps')).toBeDefined();
  });

  it('shows imported badge for tests without sidecars', () => {
    render(<LibraryView entries={mockEntries} onLoad={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText('imported')).toBeDefined();
  });

  it('calls onLoad when clicking a test entry', () => {
    const onLoad = vi.fn();
    render(<LibraryView entries={mockEntries} onLoad={onLoad} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByText('Login flow'));
    expect(onLoad).toHaveBeenCalledWith('login-flow');
  });

  it('calls onDelete when clicking delete button', () => {
    const onDelete = vi.fn();
    render(<LibraryView entries={mockEntries} onLoad={vi.fn()} onDelete={onDelete} onRefresh={vi.fn()} />);
    const deleteButtons = screen.getAllByText('×');
    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith('login-flow');
  });

  it('shows empty state when no entries', () => {
    render(<LibraryView entries={[]} onLoad={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText(/no saved tests/i)).toBeDefined();
  });
});
