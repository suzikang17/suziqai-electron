import React, { useState } from 'react';
import type { Step, StepAction } from '@shared/types';

const statusIcons: Record<string, { icon: string; color: string }> = {
  passed: { icon: '✓', color: 'var(--accent-green)' },
  running: { icon: '●', color: 'var(--accent-yellow)' },
  pending: { icon: '○', color: 'var(--text-muted)' },
  failed: { icon: '✗', color: 'var(--accent-red)' },
};

interface StepItemProps {
  step: Step;
  index: number;
  onAccept: () => void;
  onDeny: () => void;
  onReset?: () => void;
  onUpdate?: (action: StepAction, label: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragOver?: boolean;
}

const tinyBtn: React.CSSProperties = {
  background: 'none',
  fontSize: 9,
  padding: '0 4px',
  cursor: 'pointer',
  fontWeight: 600,
  lineHeight: '16px',
};

export function StepItem({ step, index, onAccept, onDeny, onReset, onUpdate, draggable, onDragStart, onDragOver, onDrop, isDragOver }: StepItemProps) {
  const { icon, color } = statusIcons[step.status];
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [editSelector, setEditSelector] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const isAssertion = step.action.type === 'assert' || step.action.type === 'waitFor';

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

  if (editing) {
    return (
      <div style={{ padding: '4px 0 4px 20px' }}>
        <input
          value={editLabel}
          onChange={(e) => setEditLabel(e.target.value)}
          style={{ width: '100%', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderRadius: 3, padding: '3px 6px', fontSize: 11, fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', marginBottom: 3 }}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
        />
        {(step.action.type === 'fill' || step.action.type === 'assert' || step.action.type === 'navigate') && (
          <input
            value={editSelector}
            onChange={(e) => setEditSelector(e.target.value)}
            placeholder={step.action.type === 'navigate' ? 'URL...' : 'Selector...'}
            style={{ width: '100%', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderRadius: 3, padding: '3px 6px', fontSize: 11, fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', marginBottom: 3 }}
            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
          />
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={saveEdit} style={{ background: 'var(--accent-green)', color: '#fff', borderRadius: 3, padding: '1px 6px', fontSize: 9, fontWeight: 'bold' }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative' }}
    >
      {/* Hover toolbar */}
      {hovered && !isAssertion && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '1px 4px',
          background: 'var(--bg-tertiary)',
          borderRadius: '3px 3px 0 0',
          marginLeft: draggable ? 18 : 0,
          marginBottom: -1,
        }}>
          {step.status === 'pending' && (
            <button onClick={onAccept} style={{ ...tinyBtn, color: 'var(--accent-green)' }}>▶ Run</button>
          )}
          {(step.status === 'passed' || step.status === 'failed') && (
            <button onClick={onAccept} style={{ ...tinyBtn, color: 'var(--accent-green)' }}>▶ Re-run</button>
          )}
          {onUpdate && (
            <button onClick={startEdit} style={{ ...tinyBtn, color: 'var(--accent-blue, #0969da)' }}>Edit</button>
          )}
          <button onClick={onDeny} style={{ ...tinyBtn, color: 'var(--accent-red)' }}>Delete</button>
        </div>
      )}

      {/* Step row */}
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          padding: '3px 0',
          paddingLeft: isAssertion ? 16 : 0,
          cursor: draggable ? 'grab' : 'default',
          opacity: step.status === 'pending' ? 0.7 : 1,
          borderTop: isDragOver ? '2px solid var(--accent-blue, #0969da)' : '2px solid transparent',
          transition: 'border-color 0.1s',
          background: hovered ? 'var(--bg-tertiary)' : 'transparent',
          borderRadius: 3,
        }}
      >
        {draggable && (
          <span style={{ color: 'var(--text-muted)', fontSize: 10, cursor: 'grab', flexShrink: 0, userSelect: 'none' }}>⠿</span>
        )}
        <span style={{ color, fontSize: 11, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3 }}>
          {step.label}
        </span>
        {/* Inline actions for assertions (no toolbar) */}
        {isAssertion && hovered && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            {step.status === 'pending' && (
              <button onClick={(e) => { e.stopPropagation(); onAccept(); }} style={{ ...tinyBtn, color: 'var(--accent-green)' }}>Run</button>
            )}
            {(step.status === 'passed' || step.status === 'failed') && (
              <button onClick={(e) => { e.stopPropagation(); onAccept(); }} style={{ ...tinyBtn, color: 'var(--accent-green)' }}>Re-run</button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onDeny(); }} style={{ ...tinyBtn, color: 'var(--text-muted)' }}>×</button>
          </div>
        )}
      </div>

      {step.error && (
        <div style={{ color: 'var(--accent-red)', fontSize: 10, paddingLeft: draggable ? 36 : 18, marginTop: -2, marginBottom: 2 }}>
          {step.error}
        </div>
      )}
    </div>
  );
}
