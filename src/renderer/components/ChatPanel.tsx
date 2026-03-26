import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageType, AppMode } from '@shared/types';

interface ChatPanelProps {
  messages: ChatMessageType[];
  mode: AppMode;
  onSend: (content: string) => void;
}

const modeBadge: Record<AppMode, { label: string; color: string }> = {
  command: { label: 'Command', color: 'var(--accent-green)' },
  record: { label: 'Recording', color: 'var(--accent-red)' },
  observe: { label: 'Observing', color: 'var(--accent-yellow)' },
};

export function ChatPanel({ messages, mode, onSend }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  const badge = modeBadge[mode];

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', fontSize: 13 }}>suziQ AI</span>
        <span
          style={{
            color: badge.color,
            fontSize: 9,
            background: 'var(--bg-tertiary)',
            padding: '2px 6px',
            borderRadius: 3,
          }}
        >
          {badge.label}
        </span>
      </div>

      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe what to test..."
          style={{
            flex: 1,
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 12,
          }}
        />
        <button
          type="submit"
          style={{
            background: 'var(--accent-green)',
            color: 'var(--bg-primary)',
            borderRadius: 4,
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 'bold',
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
