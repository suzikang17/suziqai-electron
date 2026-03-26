import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanel } from '../../src/renderer/components/ChatPanel';
import type { ChatMessage } from '../../src/shared/types';

const mockMessages: ChatMessage[] = [
  { id: '1', role: 'user', content: 'Test the login page', timestamp: 1000 },
  { id: '2', role: 'assistant', content: 'I\'ll navigate to /login and test the form.', timestamp: 1001 },
];

describe('ChatPanel', () => {
  it('renders messages', () => {
    render(<ChatPanel messages={mockMessages} mode="command" onSend={vi.fn()} />);
    expect(screen.getByText('Test the login page')).toBeTruthy();
    expect(screen.getByText("I'll navigate to /login and test the form.")).toBeTruthy();
  });

  it('calls onSend when submitting a message', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} mode="command" onSend={onSend} />);

    const input = screen.getByPlaceholderText('Describe what to test...');
    fireEvent.change(input, { target: { value: 'click the button' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).toHaveBeenCalledWith('click the button');
  });
});
