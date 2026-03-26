import React, { useState, useRef, useEffect } from 'react';
import type { StepAction } from '@shared/types';

interface StepComposerProps {
  onSubmit: (step: { label: string; action: StepAction } | { prompt: string }) => void;
  onCancel: () => void;
}

type ComposerMode = 'ai' | 'manual';

const actionTypes = ['click', 'fill', 'navigate', 'assert', 'waitFor'] as const;

export function StepComposer({ onSubmit, onCancel }: StepComposerProps) {
  const [mode, setMode] = useState<ComposerMode>('ai');
  const [aiPrompt, setAiPrompt] = useState('');
  const [actionType, setActionType] = useState<string>('click');
  const [selector, setSelector] = useState('');
  const [value, setValue] = useState('');
  const [assertType, setAssertType] = useState('visible');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    onSubmit({ prompt: aiPrompt.trim() });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selector.trim() && actionType !== 'navigate') return;

    let action: StepAction;
    let label: string;

    switch (actionType) {
      case 'click':
        action = { type: 'click', selector: selector.trim() };
        label = `Click '${selector.trim()}'`;
        break;
      case 'fill':
        action = { type: 'fill', selector: selector.trim(), value: value };
        label = `Fill '${selector.trim()}' with '${value}'`;
        break;
      case 'navigate':
        action = { type: 'navigate', url: selector.trim() };
        label = `Navigate to ${selector.trim()}`;
        break;
      case 'assert':
        action = { type: 'assert', assertionType: assertType as any, expected: value, selector: selector.trim() || undefined };
        label = `Assert ${assertType}: '${value || selector.trim()}'`;
        break;
      case 'waitFor':
        action = { type: 'waitFor', selector: selector.trim() };
        label = `Wait for '${selector.trim()}'`;
        break;
      default:
        return;
    }

    onSubmit({ label, action });
  };

  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '2px solid var(--accent-blue, var(--accent-green))',
      borderRadius: 6,
      padding: 8,
      fontSize: 12,
    }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button
          onClick={() => setMode('ai')}
          style={{
            flex: 1,
            padding: '4px 0',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 500,
            background: mode === 'ai' ? 'var(--accent-green)' : 'var(--bg-tertiary)',
            color: mode === 'ai' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          AI Assist
        </button>
        <button
          onClick={() => setMode('manual')}
          style={{
            flex: 1,
            padding: '4px 0',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 500,
            background: mode === 'manual' ? 'var(--accent-blue, var(--accent-green))' : 'var(--bg-tertiary)',
            color: mode === 'manual' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          Manual
        </button>
      </div>

      {mode === 'ai' ? (
        <form onSubmit={handleAiSubmit}>
          <input
            ref={inputRef}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe the step... e.g. 'click the login button'"
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              borderRadius: 4,
              padding: '6px 8px',
              fontSize: 12,
              marginBottom: 6,
            }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="submit"
              style={{
                flex: 1,
                background: 'var(--accent-green)',
                color: '#ffffff',
                borderRadius: 4,
                padding: '4px 0',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              Generate
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '4px 8px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                borderRadius: 4,
                fontSize: 11,
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleManualSubmit}>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 11,
              marginBottom: 4,
              border: '1px solid var(--border)',
            }}
          >
            {actionTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            ref={mode === 'manual' ? inputRef : undefined}
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
            placeholder={actionType === 'navigate' ? 'URL...' : "Selector... e.g. getByText('Submit')"}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              borderRadius: 4,
              padding: '6px 8px',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              marginBottom: 4,
            }}
          />
          {(actionType === 'fill' || actionType === 'assert') && (
            <>
              {actionType === 'assert' && (
                <select
                  value={assertType}
                  onChange={(e) => setAssertType(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    borderRadius: 4,
                    padding: '4px 8px',
                    fontSize: 11,
                    marginBottom: 4,
                    border: '1px solid var(--border)',
                  }}
                >
                  <option value="visible">visible</option>
                  <option value="text">text</option>
                  <option value="url">url</option>
                  <option value="hidden">hidden</option>
                  <option value="value">value</option>
                </select>
              )}
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={actionType === 'fill' ? 'Value to type...' : 'Expected value...'}
                style={{
                  width: '100%',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  borderRadius: 4,
                  padding: '6px 8px',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  marginBottom: 4,
                }}
              />
            </>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="submit"
              style={{
                flex: 1,
                background: 'var(--accent-blue, var(--accent-green))',
                color: '#ffffff',
                borderRadius: 4,
                padding: '4px 0',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              Add Step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '4px 8px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                borderRadius: 4,
                fontSize: 11,
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
