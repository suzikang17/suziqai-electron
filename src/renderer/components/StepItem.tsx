import React, { useState } from 'react';
import type { Step, StepAction } from '@shared/types';

const statusIcons: Record<string, { icon: string; color: string }> = {
  passed: { icon: '✓', color: 'var(--accent-green)' },
  running: { icon: '●', color: 'var(--accent-yellow)' },
  pending: { icon: '○', color: 'var(--text-muted)' },
  failed: { icon: '✗', color: 'var(--accent-red)' },
};

function isAssertion(action: StepAction): boolean {
  return action.type === 'assert' || action.type === 'waitFor';
}

interface StepItemProps {
  step: Step;
  index: number;
  onAccept: () => void;
  onDeny: () => void;
  onReset?: () => void;
  onUpdate?: (action: StepAction, label: string) => void;
}

export function StepItem({ step, index, onAccept, onDeny, onReset, onUpdate }: StepItemProps) {
  const { icon, color } = statusIcons[step.status];
  const [editing, setEditing] = useState(false);
  const [editSelector, setEditSelector] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');

  const assertion = isAssertion(step.action);
  const typeLabel = assertion ? 'ASSERT' : 'ACTION';
  const typeColor = assertion ? 'var(--accent-blue, #0969da)' : 'var(--accent-green)';
  const borderColor = step.status !== 'pending' ? color : typeColor;

  const startEdit = () => {
    const action = step.action;
    setEditLabel(step.label);
    if ('selector' in action) setEditSelector(action.selector);
    else if (action.type === 'navigate') setEditSelector(action.url);
    else setEditSelector('');
    if ('value' in action) setEditValue(action.value);
    else if (action.type === 'assert') setEditValue(action.expected);
    else setEditValue('');
    setEditing(true);
  };

  const saveEdit = () => {
    if (!onUpdate) return;
    const action = { ...step.action } as any;
    if ('selector' in action) action.selector = editSelector;
    else if (action.type === 'navigate') action.url = editSelector;
    if ('value' in action) action.value = editValue;
    else if (action.type === 'assert') action.expected = editValue;
    onUpdate(action, editLabel);
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    borderRadius: 3,
    padding: '3px 6px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    border: '1px solid var(--border)',
    marginBottom: 3,
  };

  return (
    <div
      style={{
        background: step.status === 'running' ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
        borderRadius: 4,
        padding: assertion ? '5px 8px' : 8,
        borderLeft: `3px solid ${borderColor}`,
        opacity: step.status === 'pending' ? 0.7 : 1,
        marginLeft: assertion ? 12 : 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
        <span style={{ color, fontSize: 12 }}>{icon}</span>

        {/* Type badge */}
        <span style={{
          fontSize: 8,
          fontWeight: 700,
          color: typeColor,
          background: `color-mix(in srgb, ${typeColor} 15%, transparent)`,
          padding: '1px 4px',
          borderRadius: 2,
          letterSpacing: 0.5,
          lineHeight: '14px',
          flexShrink: 0,
        }}>
          {typeLabel}
        </span>

        {editing ? (
          <input
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--font-sans)', fontWeight: 'bold', fontSize: assertion ? 11 : 12, marginBottom: 0, flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
          />
        ) : (
          <span style={{ color: 'var(--text-primary)', fontSize: assertion ? 11 : 12, fontWeight: assertion ? 500 : 'bold' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{index + 1}. </span>{step.label}
          </span>
        )}
      </div>

      {editing ? (
        <div style={{ paddingLeft: 17 }}>
          <input
            value={editSelector}
            onChange={(e) => setEditSelector(e.target.value)}
            placeholder={step.action.type === 'navigate' ? 'URL...' : 'Selector...'}
            style={inputStyle}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
          />
          {(step.action.type === 'fill' || step.action.type === 'assert') && (
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={step.action.type === 'fill' ? 'Value...' : 'Expected...'}
              style={inputStyle}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
            />
          )}
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            <button onClick={saveEdit} style={{ background: 'var(--accent-green)', color: '#ffffff', borderRadius: 3, padding: '2px 8px', fontSize: 9, fontWeight: 'bold' }}>
              Save
            </button>
            <button onClick={cancelEdit} style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)', borderRadius: 3, padding: '2px 8px', fontSize: 9, border: '1px solid var(--border)' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={onUpdate ? startEdit : undefined}
          style={{
            color: 'var(--text-muted)',
            fontSize: 10,
            paddingLeft: 17,
            fontFamily: 'var(--font-mono)',
            cursor: onUpdate ? 'pointer' : 'default',
            borderRadius: 3,
          }}
          title={onUpdate ? 'Click to edit' : undefined}
        >
          {formatAction(step.action)}
        </div>
      )}

      {!editing && step.status === 'pending' && (
        <div style={{ display: 'flex', gap: 4, marginTop: 4, paddingLeft: 17 }}>
          <button onClick={onAccept} style={{ background: 'var(--accent-green)', color: '#ffffff', borderRadius: 3, padding: '2px 8px', fontSize: 9, fontWeight: 'bold' }}>
            Accept
          </button>
          <button onClick={onDeny} style={{ background: 'var(--accent-red)', color: 'white', borderRadius: 3, padding: '2px 8px', fontSize: 9, fontWeight: 'bold' }}>
            Deny
          </button>
        </div>
      )}
      {!editing && (step.status === 'passed' || step.status === 'failed') && (
        <div style={{ display: 'flex', gap: 4, marginTop: 4, paddingLeft: 17 }}>
          <button onClick={onAccept} style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-green)', borderRadius: 3, padding: '2px 8px', fontSize: 9, fontWeight: 'bold', border: '1px solid var(--accent-green)' }}>
            Re-run
          </button>
          <button onClick={onDeny} style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)', borderRadius: 3, padding: '2px 8px', fontSize: 9, border: '1px solid var(--border)' }}>
            Remove
          </button>
        </div>
      )}
      {step.error && (
        <div style={{ color: 'var(--accent-red)', fontSize: 10, paddingLeft: 17, marginTop: 4 }}>
          {step.error}
        </div>
      )}
    </div>
  );
}

function formatAction(action: Step['action']): string {
  switch (action.type) {
    case 'navigate': return `goto('${action.url}')`;
    case 'click': return `click('${action.selector}')`;
    case 'fill': return `fill('${action.selector}', '${action.value}')`;
    case 'assert': {
      const sel = action.selector ? `(${action.selector})` : '';
      return `expect${sel}.${action.assertionType}('${action.expected}')`;
    }
    case 'screenshot': return 'screenshot()';
    case 'waitFor': return `waitFor('${action.selector}')`;
  }
}
