import React from 'react';
import type { ChatMessage as ChatMessageType } from '@shared/types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <span
        style={{
          color: isUser ? 'var(--accent-red)' : 'var(--accent-green)',
          fontSize: 11,
          fontWeight: 'bold',
          minWidth: 30,
        }}
      >
        {isUser ? 'You:' : 'AI:'}
      </span>
      <span style={{ color: isUser ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 12 }}>
        {message.content}
      </span>
    </div>
  );
}
