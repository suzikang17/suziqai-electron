import React from 'react';
import { StepItem } from './StepItem';
import type { TestCase } from '@shared/types';

interface StepSidebarProps {
  testCase: TestCase;
  onAcceptStep: (stepId: string) => void;
  onDenyStep: (stepId: string) => void;
  onRunAll: () => void;
  onExport: () => void;
}

export function StepSidebar({ testCase, onAcceptStep, onDenyStep, onRunAll, onExport }: StepSidebarProps) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', fontSize: 13 }}>Test Steps</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{testCase.name}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {testCase.steps.map((step, i) => (
          <StepItem
            key={step.id}
            step={step}
            index={i}
            onAccept={() => onAcceptStep(step.id)}
            onDeny={() => onDenyStep(step.id)}
          />
        ))}
        {testCase.steps.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 40 }}>
            No steps yet. Use the chat to describe what to test, or start recording.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
        <button
          onClick={onRunAll}
          style={{
            flex: 1,
            background: 'var(--accent-green)',
            color: 'var(--bg-primary)',
            borderRadius: 4,
            padding: 6,
            fontSize: 11,
            fontWeight: 'bold',
          }}
        >
          Run All
        </button>
        <button
          onClick={onExport}
          style={{
            flex: 1,
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            borderRadius: 4,
            padding: 6,
            fontSize: 11,
          }}
        >
          Export .spec.ts
        </button>
      </div>
    </div>
  );
}
