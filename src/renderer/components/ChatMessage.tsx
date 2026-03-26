import React from 'react';
import type { ChatMessage as ChatMessageType } from '@shared/types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = (message as any).role === 'system';
  const isAi = message.role === 'assistant';

  // System/log messages — compact monospace style
  if (isSystem) {
    const content = message.content;
    const isError = content.includes('✗') || content.toLowerCase().includes('error') || content.toLowerCase().includes('failed');
    const isSuccess = content.includes('✓');
    const isNav = content.startsWith('Navigated');

    return (
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: isError ? 'var(--accent-red)' : isSuccess ? 'var(--accent-green)' : isNav ? 'var(--accent-blue, #0969da)' : 'var(--text-muted)',
        padding: '1px 0',
        opacity: 0.9,
      }}>
        <span style={{ color: 'var(--text-muted)', marginRight: 6, fontSize: 9 }}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        {content}
      </div>
    );
  }

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
