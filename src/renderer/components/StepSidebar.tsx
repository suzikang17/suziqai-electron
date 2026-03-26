import React from 'react';
import { StepItem } from './StepItem';
import type { TestCase } from '@shared/types';

interface StepSidebarProps {
  tests: TestCase[];
  activeTestId: string;
  onSwitchTest: (testId: string) => void;
  onCreateTest: () => void;
  onRenameTest: (testId: string, name: string) => void;
  onDeleteTest: (testId: string) => void;
  onAcceptStep: (stepId: string) => void;
  onDenyStep: (stepId: string) => void;
  onResetStep: (stepId: string) => void;
  onRunAll: () => void;
  onExport: () => void;
}

export function StepSidebar({
  tests,
  activeTestId,
  onSwitchTest,
  onCreateTest,
  onRenameTest,
  onDeleteTest,
  onAcceptStep,
  onDenyStep,
  onResetStep,
  onRunAll,
  onExport,
}: StepSidebarProps) {
  const activeTest = tests.find(t => t.id === activeTestId) || tests[0];

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
      {/* Test tabs */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', fontSize: 13 }}>Tests</span>
          <button
            onClick={onCreateTest}
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--accent-green)',
              borderRadius: 3,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 'bold',
            }}
          >
            + New
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto' }}>
          {tests.map(test => (
            <div
              key={test.id}
              onClick={() => onSwitchTest(test.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                borderRadius: 3,
                background: test.id === activeTestId ? 'var(--bg-tertiary)' : 'transparent',
                cursor: 'pointer',
                borderLeft: test.id === activeTestId ? '2px solid var(--accent-green)' : '2px solid transparent',
              }}
            >
              <span
                style={{ fontSize: 11, color: test.id === activeTestId ? 'var(--text-primary)' : 'var(--text-secondary)', flex: 1 }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  const newName = prompt('Rename test:', test.name);
                  if (newName) onRenameTest(test.id, newName);
                }}
              >
                {test.name}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>
                {test.steps.length} steps
              </span>
              {tests.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteTest(test.id); }}
                  style={{
                    background: 'none',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    marginLeft: 4,
                    padding: '0 2px',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 1, background: 'var(--border)', marginBottom: 8 }} />

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {activeTest.steps.map((step, i) => (
          <StepItem
            key={step.id}
            step={step}
            index={i}
            onAccept={() => onAcceptStep(step.id)}
            onDeny={() => onDenyStep(step.id)}
            onReset={() => onResetStep(step.id)}
          />
        ))}
        {activeTest.steps.length === 0 && (
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
