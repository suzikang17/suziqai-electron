import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageType, AppMode } from '@shared/types';

interface PickerResult {
  selectors: Array<{ type: string; selector: string; confidence: string }>;
  element: { tag: string; text: string; id: string | null } | null;
}

interface ChatPanelProps {
  messages: ChatMessageType[];
  mode: AppMode;
  isLoading?: boolean;
  pickerResult?: PickerResult | null;
  onSend: (content: string) => void;
  onPickSelector?: (selector: string, element: any) => void;
  onDismissPicker?: () => void;
}

const modeBadge: Record<AppMode, { label: string; color: string }> = {
  command: { label: 'Command', color: 'var(--accent-green)' },
  record: { label: 'Recording', color: 'var(--accent-red)' },
  observe: { label: 'Observing', color: 'var(--accent-yellow)' },
};

const typeLabels: Record<string, string> = {
  getByText: 'Text', getByRole: 'Role', getByLabel: 'Label',
  getByTestId: 'TestID', getByPlaceholder: 'Placeholder', css: 'CSS',
};
const confColors: Record<string, string> = {
  high: 'var(--accent-green)', medium: 'var(--accent-yellow)', low: 'var(--text-muted)',
};

export function ChatPanel({ messages, mode, isLoading, pickerResult, onSend, onPickSelector, onDismissPicker }: ChatPanelProps) {
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
        {isLoading && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: 'var(--accent-green)', fontSize: 11, fontWeight: 'bold', minWidth: 30 }}>AI:</span>
            <span style={{ display: 'flex', gap: 4 }}>
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </span>
          </div>
        )}
        {pickerResult && pickerResult.selectors.length > 0 && (
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 6, padding: 8, marginTop: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Picked: <span style={{ fontFamily: 'var(--font-mono)' }}>&lt;{pickerResult.element?.tag}&gt;</span>
              {pickerResult.element?.text && <span> "{pickerResult.element.text.substring(0, 40)}"</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {pickerResult.selectors.map((s, i) => (
                <button
                  key={i}
                  onClick={() => onPickSelector?.(s.selector, pickerResult.element)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px', background: 'var(--bg-primary)',
                    borderRadius: 4, textAlign: 'left', fontSize: 11,
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: 'var(--bg-secondary)',
                    color: confColors[s.confidence] || 'var(--text-muted)',
                    fontWeight: 600, minWidth: 60, textAlign: 'center',
                  }}>
                    {typeLabels[s.type] || s.type}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {s.selector}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={onDismissPicker}
              style={{
                width: '100%', marginTop: 6, padding: '3px 0',
                background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                borderRadius: 4, fontSize: 10,
              }}
            >
              Dismiss
            </button>
          </div>
        )}
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
            color: '#ffffff',
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
