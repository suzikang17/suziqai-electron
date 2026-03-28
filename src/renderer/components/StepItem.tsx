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
  onAddBelow?: () => void;
  onToggle?: () => void;
  isExpanded?: boolean;
  childCount?: number;
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

export function StepItem({ step, index, onAccept, onDeny, onReset, onUpdate, onAddBelow, onToggle, isExpanded, childCount, draggable, onDragStart, onDragOver, onDrop, isDragOver }: StepItemProps) {
  const { icon, color } = statusIcons[step.status];
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [editSelector, setEditSelector] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editType, setEditType] = useState(step.action.type);
  const [editAssertType, setEditAssertType] = useState(step.action.type === 'assert' ? step.action.assertionType : 'visible');
  const isAssertion = step.action.type === 'assert' || step.action.type === 'waitFor';

  const startEdit = () => {
    const action = step.action;
    setEditLabel(step.label);
    setEditType(action.type);
    if ('selector' in action) setEditSelector(action.selector);
    else if (action.type === 'navigate') setEditSelector(action.url);
    else setEditSelector('');
    if ('value' in action) setEditValue(action.value);
    else if (action.type === 'assert') { setEditValue(action.expected); setEditAssertType(action.assertionType); }
    else setEditValue('');
    setEditing(true);
  };

  const saveEdit = () => {
    if (!onUpdate) return;
    let action: any;
    switch (editType) {
      case 'navigate': action = { type: 'navigate', url: editSelector }; break;
      case 'click': action = { type: 'click', selector: editSelector }; break;
      case 'fill': action = { type: 'fill', selector: editSelector, value: editValue }; break;
      case 'assert': action = { type: 'assert', assertionType: editAssertType, expected: editValue, selector: editSelector || undefined }; break;
      case 'waitFor': action = { type: 'waitFor', selector: editSelector }; break;
      case 'screenshot': action = { type: 'screenshot' }; break;
      default: action = step.action;
    }
    onUpdate(action, editLabel);
    setEditing(false);
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    borderRadius: 4,
    padding: '5px 8px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    border: '1px solid var(--border)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  };

  const showSelector = editType !== 'screenshot';
  const showValue = editType === 'fill' || editType === 'assert';

  if (editing) {
    return (
      <div style={{
        padding: 10,
        background: 'var(--bg-tertiary)',
        borderRadius: 6,
        border: '1px solid var(--border)',
        margin: '2px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {/* Label */}
        <div>
          <div style={labelStyle}>Description</div>
          <input
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            style={fieldStyle}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          />
        </div>

        {/* Type selector */}
        <div>
          <div style={labelStyle}>Type</div>
          <select
            value={editType}
            onChange={(e) => setEditType(e.target.value as any)}
            style={{ ...fieldStyle, fontFamily: 'var(--font-sans)' }}
          >
            <optgroup label="Actions">
              <option value="navigate">Navigate</option>
              <option value="click">Click</option>
              <option value="fill">Fill</option>
              <option value="screenshot">Screenshot</option>
              <option value="waitFor">Wait For</option>
            </optgroup>
            <optgroup label="Assertions">
              <option value="assert">Assert</option>
            </optgroup>
          </select>
        </div>

        {/* Assert type */}
        {editType === 'assert' && (
          <div>
            <div style={labelStyle}>Assertion Type</div>
            <select
              value={editAssertType}
              onChange={(e) => setEditAssertType(e.target.value as any)}
              style={{ ...fieldStyle, fontFamily: 'var(--font-sans)' }}
            >
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
              <option value="text">Text Contains</option>
              <option value="url">URL Matches</option>
              <option value="value">Input Value</option>
            </select>
          </div>
        )}

        {/* Selector / URL */}
        {showSelector && (
          <div>
            <div style={labelStyle}>{editType === 'navigate' ? 'URL' : 'Selector'}</div>
            <input
              value={editSelector}
              onChange={(e) => setEditSelector(e.target.value)}
              placeholder={editType === 'navigate' ? 'https://...' : "getByRole('button', { name: '...' })"}
              style={fieldStyle}
              onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
            />
          </div>
        )}

        {/* Value / Expected */}
        {showValue && (
          <div>
            <div style={labelStyle}>{editType === 'fill' ? 'Value' : 'Expected'}</div>
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={editType === 'fill' ? 'Text to type...' : 'Expected value...'}
              style={fieldStyle}
              onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
            />
          </div>
        )}

        {/* Preview */}
        <div style={{
          background: 'var(--bg-primary)',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
        }}>
          {editType === 'navigate' && `page.goto('${editSelector}')`}
          {editType === 'click' && `page.${editSelector || 'locator(...)'}.click()`}
          {editType === 'fill' && `page.${editSelector || 'locator(...)'}.fill('${editValue}')`}
          {editType === 'assert' && `expect(page.${editSelector || 'locator(...)'}).to${editAssertType === 'visible' ? 'BeVisible' : editAssertType === 'hidden' ? 'BeHidden' : `Have${editAssertType === 'text' ? 'Text' : editAssertType === 'url' ? 'URL' : 'Value'}('${editValue}')`}()`}
          {editType === 'waitFor' && `page.${editSelector || 'locator(...)'}.waitFor()`}
          {editType === 'screenshot' && `page.screenshot()`}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setEditing(false)}
            style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)', borderRadius: 4, padding: '4px 12px', fontSize: 10, border: '1px solid var(--border)' }}
          >
            Cancel
          </button>
          <button
            onClick={saveEdit}
            style={{ background: 'var(--accent-green)', color: '#fff', borderRadius: 4, padding: '4px 12px', fontSize: 10, fontWeight: 'bold' }}
          >
            Save
          </button>
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
      {/* Hover toolbar — above right */}
      {hovered && (
        <div style={{
          position: 'absolute',
          top: -2,
          right: 0,
          display: 'flex',
          gap: 1,
          background: 'var(--bg-tertiary)',
          borderRadius: 3,
          padding: '1px 2px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          zIndex: 1,
        }}>
          <button onClick={(e) => { e.stopPropagation(); onAccept(); }} style={{ ...tinyBtn, color: 'var(--accent-green)' }} title="Run">▶</button>
          {onUpdate && (
            <button onClick={(e) => { e.stopPropagation(); startEdit(); }} style={{ ...tinyBtn, color: 'var(--accent-blue, #0969da)' }} title="Edit">✎</button>
          )}
          {onAddBelow && (
            <button onClick={(e) => { e.stopPropagation(); onAddBelow(); }} style={{ ...tinyBtn, color: 'var(--text-secondary)' }} title="Add below">+</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDeny(); }} style={{ ...tinyBtn, color: 'var(--accent-red)' }} title="Delete">×</button>
        </div>
      )}

      {/* Step row */}
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => onToggle ? onToggle() : setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          padding: '3px 0',
          paddingLeft: isAssertion ? 24 : 0,
          cursor: 'pointer',
          opacity: step.status === 'pending' ? 0.7 : 1,
          borderTop: isDragOver ? '2px solid var(--accent-blue, #0969da)' : '2px solid transparent',
          transition: 'border-color 0.1s',
          background: hovered ? 'var(--bg-tertiary)' : 'transparent',
          borderRadius: 3,
        }}
      >
        {draggable && (
          <span
            draggable
            onDragStart={onDragStart}
            onClick={(e) => e.stopPropagation()}
            style={{ color: 'var(--text-muted)', fontSize: 10, cursor: 'grab', flexShrink: 0, userSelect: 'none' }}
          >::</span>
        )}
        <span style={{ color, fontSize: 11, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3 }}>
          {step.label}
        </span>
        {childCount != null && childCount > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: 9, flexShrink: 0 }}>
            {childCount}
          </span>
        )}
      </div>

      {/* Expanded details (for assertion steps clicked individually) */}
      {!onToggle && expanded && !editing && (
        <div style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          padding: '2px 0 4px',
          paddingLeft: isAssertion ? 42 : draggable ? 36 : 18,
        }}>
          {formatAction(step.action)}
        </div>
      )}

      {step.error && (
        <div style={{ color: 'var(--accent-red)', fontSize: 10, paddingLeft: isAssertion ? 34 : draggable ? 36 : 18, marginTop: -2, marginBottom: 2 }}>
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
