import React, { useState } from 'react';
import { StepItem } from './StepItem';
import { StepComposer } from './StepComposer';
import { LibraryView } from './LibraryView';
import type { TestCase, StepAction } from '@shared/types';
import type { LibraryEntry } from '@shared/types';

function InsertButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: hovered ? 24 : 8,
        cursor: 'pointer',
        transition: 'height 0.15s ease',
        opacity: hovered ? 1 : 0,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        color: 'var(--accent-blue, var(--accent-green))',
        fontWeight: 500,
      }}>
        <span>＋ insert step here</span>
      </div>
    </div>
  );
}

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
  onUpdateStep: (stepId: string, action: any, label: string) => void;
  onInsertStep: (index: number, step: { label: string; action: StepAction }) => void;
  onInsertPrompt: (index: number, prompt: string) => void;
  onRunAll: () => void;
  onRunActAndAssert: () => void;
  onRunGroup: (stepIds: string[]) => void;
  onReorderStep: (fromStepIds: string[], beforeStepId: string) => void;
  onExport: () => void;
  sidebarMode: 'session' | 'library';
  onSidebarModeChange: (mode: 'session' | 'library') => void;
  onSaveTest: () => void;
  libraryEntries: LibraryEntry[];
  onLoadFromLibrary: (fileName: string) => void;
  onDeleteFromLibrary: (fileName: string) => void;
  onRefreshLibrary: () => void;
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
  onUpdateStep,
  onInsertStep,
  onInsertPrompt,
  onRunAll,
  onRunActAndAssert,
  onRunGroup,
  onReorderStep,
  onExport,
  sidebarMode,
  onSidebarModeChange,
  onSaveTest,
  libraryEntries,
  onLoadFromLibrary,
  onDeleteFromLibrary,
  onRefreshLibrary,
}: StepSidebarProps) {
  const activeTest = tests.find(t => t.id === activeTestId) || tests[0];
  const [composerAt, setComposerAt] = useState<number | null>(null);
  const [dragFromGroup, setDragFromGroup] = useState<number | null>(null); // group index in stepGroups
  const [dragOverGroup, setDragOverGroup] = useState<number | null>(null);
  // Start with all groups collapsed when there are many steps
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);

  // Group steps: each action + following assertions form a group
  const stepGroups: Array<{ actionIndex: number; indices: number[] }> = [];
  if (activeTest) {
    let currentGroup: { actionIndex: number; indices: number[] } | null = null;
    activeTest.steps.forEach((step, i) => {
      const isAssertion = step.action.type === 'assert' || step.action.type === 'waitFor';
      if (!isAssertion) {
        if (currentGroup) stepGroups.push(currentGroup);
        currentGroup = { actionIndex: i, indices: [i] };
      } else if (currentGroup) {
        currentGroup.indices.push(i);
      } else {
        // Orphan assertion — its own group
        stepGroups.push({ actionIndex: i, indices: [i] });
      }
    });
    if (currentGroup) stepGroups.push(currentGroup);
  }

  // Auto-collapse all groups when step count is high
  React.useEffect(() => {
    if (activeTest && activeTest.steps.length > 10 && stepGroups.length > 0 && !hasAutoCollapsed) {
      setCollapsedGroups(new Set(stepGroups.map(g => g.actionIndex)));
      setHasAutoCollapsed(true);
    }
  }, [activeTest?.steps.length, stepGroups.length]);

  const toggleGroup = (actionIndex: number) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(actionIndex)) next.delete(actionIndex);
      else next.add(actionIndex);
      return next;
    });
  };
  const [renamingTestId, setRenamingTestId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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
      {/* Session / Library toggle */}
      <div style={{
        display: 'flex',
        marginBottom: 10,
        background: 'var(--bg-primary)',
        borderRadius: 6,
        padding: 2,
        gap: 2,
      }}>
        {(['session', 'library'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => onSidebarModeChange(tab)}
            style={{
              flex: 1,
              padding: '5px 0',
              fontSize: 11,
              fontWeight: 600,
              color: sidebarMode === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              background: sidebarMode === tab ? 'var(--bg-tertiary)' : 'transparent',
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              letterSpacing: 0.3,
            }}
          >
            {tab === 'session' ? 'Session' : 'Library'}
          </button>
        ))}
      </div>

      {sidebarMode === 'session' ? (
        <>
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
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenameValue(test.name);
                    setRenamingTestId(test.id);
                  }}
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
                  {renamingTestId === test.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => {
                        if (renameValue.trim()) onRenameTest(test.id, renameValue.trim());
                        setRenamingTestId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (renameValue.trim()) onRenameTest(test.id, renameValue.trim());
                          setRenamingTestId(null);
                        }
                        if (e.key === 'Escape') setRenamingTestId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        flex: 1,
                        fontSize: 11,
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--accent-green)',
                        borderRadius: 3,
                        padding: '2px 6px',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <span
                      style={{ fontSize: 11, color: test.id === activeTestId ? 'var(--text-primary)' : 'var(--text-secondary)', flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {test.name}
                      </span>
                    </span>
                  )}
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

          {/* Collapse/Expand all toggle */}
          {stepGroups.some(g => g.indices.length > 1) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button
                onClick={() => {
                  const allCollapsed = stepGroups.every(g => g.indices.length <= 1 || collapsedGroups.has(g.actionIndex));
                  if (allCollapsed) {
                    setCollapsedGroups(new Set());
                  } else {
                    setCollapsedGroups(new Set(stepGroups.map(g => g.actionIndex)));
                  }
                }}
                style={{
                  background: 'none',
                  color: 'var(--accent-blue, #0969da)',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 6px',
                }}
              >
                {stepGroups.every(g => g.indices.length <= 1 || collapsedGroups.has(g.actionIndex))
                  ? 'Expand All'
                  : 'Collapse All'}
              </button>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Insert at top */}
            {composerAt === 0 ? (
              <StepComposer
                onSubmit={(result) => {
                  if ('prompt' in result) {
                    onInsertPrompt(0, result.prompt);
                  } else {
                    onInsertStep(0, result);
                  }
                  setComposerAt(null);
                }}
                onCancel={() => setComposerAt(null)}
              />
            ) : (
              <InsertButton onClick={() => setComposerAt(0)} />
            )}
            {stepGroups.map((group, groupIdx) => {
              const actionStep = activeTest.steps[group.actionIndex];
              const assertionIndices = group.indices.slice(1);
              const isCollapsed = collapsedGroups.has(group.actionIndex);
              const hasAssertions = assertionIndices.length > 0;
              const groupStepIds = group.indices.map(i => activeTest.steps[i].id);

              return (
                <React.Fragment key={actionStep.id}>
                  {/* Action */}
                  <StepItem
                    step={actionStep}
                    index={group.actionIndex}
                    onAccept={() => onAcceptStep(actionStep.id)}
                    onDeny={() => onDenyStep(actionStep.id)}
                    onReset={() => onResetStep(actionStep.id)}
                    onUpdate={(action, label) => onUpdateStep(actionStep.id, action, label)}
                    onAddBelow={() => setComposerAt(group.actionIndex + 1)}
                    onToggle={hasAssertions ? () => toggleGroup(group.actionIndex) : undefined}
                    isExpanded={!isCollapsed}
                    childCount={assertionIndices.length}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragFromGroup(groupIdx); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverGroup(groupIdx); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragFromGroup !== null && dragFromGroup !== groupIdx) {
                        // Move entire group (action + assertions)
                        const fromGroup = stepGroups[dragFromGroup];
                        const fromIds = fromGroup.indices.map(i => activeTest.steps[i].id);
                        const toGroupFirstId = actionStep.id;
                        onReorderStep(fromIds as any, toGroupFirstId as any);
                      }
                      setDragFromGroup(null);
                      setDragOverGroup(null);
                    }}
                    isDragOver={dragOverGroup === groupIdx}
                  />

                  {/* Nested assertions */}
                  {!isCollapsed && assertionIndices.map((idx) => {
                    const step = activeTest.steps[idx];
                    return (
                      <StepItem
                        key={step.id}
                        step={step}
                        index={idx}
                        onAccept={() => onAcceptStep(step.id)}
                        onDeny={() => onDenyStep(step.id)}
                        onReset={() => onResetStep(step.id)}
                        onUpdate={(action, label) => onUpdateStep(step.id, action, label)}
                        onAddBelow={() => setComposerAt(idx + 1)}
                      />
                    );
                  })}

                  {/* Insert after group */}
                  {composerAt === group.indices[group.indices.length - 1] + 1 ? (
                    <StepComposer
                      onSubmit={(result) => {
                        const insertIdx = group.indices[group.indices.length - 1] + 1;
                        if ('prompt' in result) {
                          onInsertPrompt(insertIdx, result.prompt);
                        } else {
                          onInsertStep(insertIdx, result);
                        }
                        setComposerAt(null);
                      }}
                      onCancel={() => setComposerAt(null)}
                    />
                  ) : (
                    <InsertButton onClick={() => setComposerAt(group.indices[group.indices.length - 1] + 1)} />
                  )}
                </React.Fragment>
              );
            })}
            {activeTest.steps.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 40 }}>
                No steps yet. Use the chat to describe what to test, or start recording.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexShrink: 0 }}>
            <button
              onClick={onRunAll}
              style={{
                flex: 1,
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                borderRadius: 6,
                padding: '8px 0',
                fontSize: 11,
                fontWeight: 'bold',
                letterSpacing: 0.3,
                border: '1px solid var(--border)',
              }}
            >
              Run All
            </button>
            <button
              onClick={onSaveTest}
              style={{
                flex: 1,
                background: 'var(--accent-blue, #0969da)',
                color: '#ffffff',
                borderRadius: 6,
                padding: '8px 0',
                fontSize: 11,
                fontWeight: 'bold',
                letterSpacing: 0.3,
              }}
            >
              Save to Library
            </button>
          </div>
        </>
      ) : (
        <LibraryView
          entries={libraryEntries}
          onLoad={onLoadFromLibrary}
          onDelete={onDeleteFromLibrary}
          onRefresh={onRefreshLibrary}
        />
      )}
    </div>
  );
}
