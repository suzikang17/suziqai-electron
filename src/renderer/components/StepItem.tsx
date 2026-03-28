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
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onToggle?: () => void;
  isExpanded?: boolean;
  childCount?: number;
}

const tinyBtn: React.CSSProperties = {
  background: 'none',
  fontSize: 12,
  padding: '0 5px',
  cursor: 'pointer',
  fontWeight: 600,
  lineHeight: '20px',
};

export function StepItem({ step, index, onAccept, onDeny, onReset, onUpdate, onAddBelow, onMoveUp, onMoveDown, onToggle, isExpanded, childCount }: StepItemProps) {
  const { icon, color } = statusIcons[step.status];
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [editSelector, setEditSelector] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editType, setEditType] = useState(step.action.type);
  const [editAssertType, setEditAssertType] = useState(step.action.type === 'assert' ? step.action.assertionType : 'visible');
  const [editorMode, setEditorMode] = useState<'form' | 'code'>('form');
  const [rawCode, setRawCode] = useState('');
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
    setRawCode(formatAction(action));
    setEditorMode('form');
    setEditing(true);
  };

  const parseCode = (code: string): { type: string; selector: string; value: string; assertType: string } | null => {
    const c = code.trim();
    let m: RegExpMatchArray | null;

    m = c.match(/^(?:page\.)?goto\(['"](.+?)['"]\)$/);
    if (m) return { type: 'navigate', selector: m[1], value: '', assertType: '' };

    m = c.match(/^(?:page\.)?click\(['"](.+?)['"]\)$/);
    if (m) return { type: 'click', selector: m[1], value: '', assertType: '' };

    m = c.match(/^(?:page\.)?fill\(['"](.+?)['"],\s*['"](.+?)['"]\)$/);
    if (m) return { type: 'fill', selector: m[1], value: m[2], assertType: '' };

    m = c.match(/^(?:page\.)?waitFor\(['"](.+?)['"]\)$/);
    if (m) return { type: 'waitFor', selector: m[1], value: '', assertType: '' };

    m = c.match(/^expect\((.+?)\)\.(visible|hidden|text|url|value)\(['"](.+?)['"]\)$/);
    if (m) return { type: 'assert', selector: m[1], value: m[3], assertType: m[2] };

    m = c.match(/^(?:page\.)?screenshot\(\)$/);
    if (m) return { type: 'screenshot', selector: '', value: '', assertType: '' };

    return null;
  };

  const syncCodeToForm = () => {
    const parsed = parseCode(rawCode);
    if (parsed) {
      setEditType(parsed.type as any);
      setEditSelector(parsed.selector);
      setEditValue(parsed.value);
      if (parsed.assertType) setEditAssertType(parsed.assertType as any);
    }
  };

  const syncFormToCode = () => {
    let code = '';
    switch (editType) {
      case 'navigate': code = `goto('${editSelector}')`; break;
      case 'click': code = `click('${editSelector}')`; break;
      case 'fill': code = `fill('${editSelector}', '${editValue}')`; break;
      case 'assert': code = `expect(${editSelector || 'page'}).${editAssertType}('${editValue}')`; break;
      case 'waitFor': code = `waitFor('${editSelector}')`; break;
      case 'screenshot': code = `screenshot()`; break;
    }
    setRawCode(code);
  };

  const saveEdit = () => {
    if (!onUpdate) return;

    let type = editType;
    let selector = editSelector;
    let value = editValue;
    let assertType = editAssertType;

    // In code mode, parse the raw code directly
    if (editorMode === 'code') {
      const parsed = parseCode(rawCode);
      if (parsed) {
        type = parsed.type as any;
        selector = parsed.selector;
        value = parsed.value;
        if (parsed.assertType) assertType = parsed.assertType as any;
      }
    }

    let action: any;
    switch (type) {
      case 'navigate': action = { type: 'navigate', url: selector }; break;
      case 'click': action = { type: 'click', selector }; break;
      case 'fill': action = { type: 'fill', selector, value }; break;
      case 'assert': action = { type: 'assert', assertionType: assertType, expected: value, selector: selector || undefined }; break;
      case 'waitFor': action = { type: 'waitFor', selector }; break;
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
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 0, background: 'var(--bg-primary)', borderRadius: 4, padding: 2 }}>
          {(['form', 'code'] as const).map(m => (
            <button
              key={m}
              onClick={() => {
                if (m === 'code' && editorMode === 'form') syncFormToCode();
                if (m === 'form' && editorMode === 'code') syncCodeToForm();
                setEditorMode(m);
              }}
              style={{
                flex: 1,
                padding: '3px 0',
                fontSize: 10,
                fontWeight: 600,
                color: editorMode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                background: editorMode === m ? 'var(--bg-tertiary)' : 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              {m === 'form' ? 'Form' : 'Code'}
            </button>
          ))}
        </div>

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

        {editorMode === 'form' ? (
          <>
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
          </>
        ) : (
          /* Code editor */
          <div>
            <div style={labelStyle}>Playwright Code</div>
            <textarea
              value={rawCode}
              onChange={(e) => setRawCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
              spellCheck={false}
              style={{
                ...fieldStyle,
                minHeight: 60,
                resize: 'vertical',
                lineHeight: 1.5,
                tabSize: 2,
              }}
              placeholder={"goto('https://...')\nclick('selector')\nfill('selector', 'value')\nexpect(selector).visible('expected')"}
            />
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
              Supported: goto, click, fill, waitFor, screenshot, expect(...).visible/hidden/text/url/value
            </div>
          </div>
        )}

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
          {onMoveUp && (
            <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} style={{ ...tinyBtn, color: 'var(--text-muted)' }} title="Move up">↑</button>
          )}
          {onMoveDown && (
            <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} style={{ ...tinyBtn, color: 'var(--text-muted)' }} title="Move down">↓</button>
          )}
          {onAddBelow && (
            <button onClick={(e) => { e.stopPropagation(); onAddBelow(); }} style={{ ...tinyBtn, color: 'var(--text-secondary)' }} title="Add below">+</button>
          )}
          {onUpdate && (
            <button onClick={(e) => { e.stopPropagation(); startEdit(); }} style={{ ...tinyBtn, color: 'var(--accent-blue, #0969da)' }} title="Edit">✎</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDeny(); }} style={{ ...tinyBtn, color: 'var(--accent-red)' }} title="Delete">🗑</button>
        </div>
      )}

      {/* Step row */}
      <div
        onClick={() => onToggle ? onToggle() : setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          padding: '4px 0',
          paddingLeft: isAssertion ? 24 : 0,
          cursor: 'pointer',
          opacity: step.status === 'pending' ? 0.7 : 1,
          background: hovered ? 'var(--bg-tertiary)' : 'transparent',
          borderRadius: 3,
        }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); onAccept(); }}
          title={step.status === 'pending' ? 'Run' : 'Re-run'}
          style={{ color, fontSize: 13, flexShrink: 0, cursor: 'pointer' }}
        >
          {hovered && (step.status === 'pending' || step.status === 'passed' || step.status === 'failed') ? '▶' : icon}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, lineHeight: 1.4 }}>
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
