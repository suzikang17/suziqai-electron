import React from 'react';

interface SelectorOption {
  type: string;
  selector: string;
  confidence: string;
}

interface SelectorPopoverProps {
  selectors: SelectorOption[];
  element: { tag: string; text: string; id: string | null } | null;
  onSelect: (selector: string) => void;
  onDismiss: () => void;
}

const confidenceColors: Record<string, string> = {
  high: 'var(--accent-green)',
  medium: 'var(--accent-yellow)',
  low: 'var(--text-muted)',
};

const typeLabels: Record<string, string> = {
  getByText: 'Text',
  getByRole: 'Role',
  getByLabel: 'Label',
  getByTestId: 'TestID',
  getByPlaceholder: 'Placeholder',
  css: 'CSS',
};

export function SelectorPopover({ selectors, element, onSelect, onDismiss }: SelectorPopoverProps) {
  return (
    <div style={{
      position: 'absolute',
      bottom: '100%',
      left: 0,
      right: 0,
      background: 'var(--bg-primary)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: 8,
      marginBottom: 4,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 100,
    }}>
      {element && (
        <div style={{ marginBottom: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>&lt;{element.tag}&gt;</span>
          {element.text && <span> "{element.text.substring(0, 40)}"</span>}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {selectors.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s.selector)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              background: 'var(--bg-secondary)',
              borderRadius: 4,
              textAlign: 'left',
              fontSize: 11,
              border: '1px solid var(--border)',
            }}
          >
            <span style={{
              fontSize: 9,
              padding: '1px 4px',
              borderRadius: 3,
              background: 'var(--bg-tertiary)',
              color: confidenceColors[s.confidence] || 'var(--text-muted)',
              fontWeight: 500,
              minWidth: 55,
              textAlign: 'center',
            }}>
              {typeLabels[s.type] || s.type}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', flex: 1 }}>
              {s.selector}
            </span>
          </button>
        ))}
      </div>
      <button
        onClick={onDismiss}
        style={{
          width: '100%',
          marginTop: 6,
          padding: '3px 0',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-muted)',
          borderRadius: 4,
          fontSize: 10,
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
