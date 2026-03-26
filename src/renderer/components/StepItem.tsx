import React from 'react';
import type { Step } from '@shared/types';

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
}

export function StepItem({ step, index, onAccept, onDeny }: StepItemProps) {
  const { icon, color } = statusIcons[step.status];
  const actionSummary = formatAction(step.action);

  return (
    <div
      style={{
        background: step.status === 'running' ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
        borderRadius: 4,
        padding: 8,
        borderLeft: `3px solid ${color}`,
        opacity: step.status === 'pending' ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ color, fontSize: 12 }}>{icon}</span>
        <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 'bold' }}>
          {index + 1}. {step.label}
        </span>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, paddingLeft: 17 }}>
        {actionSummary}
      </div>
      {step.status === 'pending' && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, paddingLeft: 17 }}>
          <button
            onClick={onAccept}
            style={{
              background: 'var(--accent-green)',
              color: 'var(--bg-primary)',
              borderRadius: 3,
              padding: '2px 8px',
              fontSize: 9,
              fontWeight: 'bold',
            }}
          >
            Accept
          </button>
          <button
            onClick={onDeny}
            style={{
              background: 'var(--accent-red)',
              color: 'white',
              borderRadius: 3,
              padding: '2px 8px',
              fontSize: 9,
              fontWeight: 'bold',
            }}
          >
            Deny
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
    case 'assert': return `expect(${action.selector ?? 'page'}).${action.assertionType}('${action.expected}')`;
    case 'screenshot': return 'screenshot()';
    case 'waitFor': return `waitFor('${action.selector}')`;
  }
}
