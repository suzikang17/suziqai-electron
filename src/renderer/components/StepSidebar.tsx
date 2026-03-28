import React, { useState } from 'react';
import { StepItem } from './StepItem';
import { StepComposer } from './StepComposer';
import { LibraryView } from './LibraryView';
import type { TestSuite, StepAction } from '@shared/types';
import type { LibraryEntry } from '@shared/types';

interface StepSidebarProps {
  suites: TestSuite[];
  activeSuiteId: string;
  activeBlockId: string;
  onSwitchSuite: (suiteId: string) => void;
  onSwitchBlock: (blockId: string) => void;
  onCreateSuite: () => void;
  onCreateBlock: () => void;
  onRenameSuite: (suiteId: string, name: string) => void;
  onRenameSuiteFileName: (suiteId: string, fileName: string) => void;
  onRenameBlock: (blockId: string, name: string) => void;
  onDeleteSuite: (suiteId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onAddBeforeEachStep: (step: { label: string; action: StepAction }) => void;
  onRemoveBeforeEachStep: (stepId: string) => void;
  onAcceptStep: (stepId: string) => void;
  onDenyStep: (stepId: string) => void;
  onResetStep: (stepId: string) => void;
  onUpdateStep: (stepId: string, action: any, label: string) => void;
  onInsertStep: (index: number, step: { label: string; action: StepAction }) => void;
  onInsertPrompt: (index: number, prompt: string) => void;
  onRunAll: () => void;
  onRunActAndAssert: () => void;
  onRunGroup: (stepIds: string[]) => void;
  onMoveStep: (stepIndex: number, direction: 'up' | 'down') => void;
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
  suites,
  activeSuiteId,
  activeBlockId,
  onSwitchSuite,
  onSwitchBlock,
  onCreateSuite,
  onCreateBlock,
  onRenameSuite,
  onRenameSuiteFileName,
  onRenameBlock,
  onDeleteSuite,
  onDeleteBlock,
  onAddBeforeEachStep,
  onRemoveBeforeEachStep,
  onAcceptStep,
  onDenyStep,
  onResetStep,
  onUpdateStep,
  onInsertStep,
  onInsertPrompt,
  onRunAll,
  onRunActAndAssert,
  onRunGroup,
  onMoveStep,
  onExport,
  sidebarMode,
  onSidebarModeChange,
  onSaveTest,
  libraryEntries,
  onLoadFromLibrary,
  onDeleteFromLibrary,
  onRefreshLibrary,
}: StepSidebarProps) {
  const activeSuite = suites.find(s => s.id === activeSuiteId) || suites[0];
  const activeBlock = activeSuite?.tests.find(b => b.id === activeBlockId) || activeSuite?.tests[0];

  const [composerAt, setComposerAt] = useState<number | null>(null);
  const [beforeEachComposerOpen, setBeforeEachComposerOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  const [beforeEachExpanded, setBeforeEachExpanded] = useState(false);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());

  // Group steps: each action + following assertions form a group
  const stepGroups: Array<{ actionIndex: number; indices: number[] }> = [];
  if (activeBlock) {
    let currentGroup: { actionIndex: number; indices: number[] } | null = null;
    activeBlock.steps.forEach((step, i) => {
      const isAssertion = step.action.type === 'assert' || step.action.type === 'waitFor';
      if (!isAssertion) {
        if (currentGroup) stepGroups.push(currentGroup);
        currentGroup = { actionIndex: i, indices: [i] };
      } else if (currentGroup) {
        currentGroup.indices.push(i);
      } else {
        stepGroups.push({ actionIndex: i, indices: [i] });
      }
    });
    if (currentGroup) stepGroups.push(currentGroup);
  }

  // Auto-collapse all groups when step count is high
  React.useEffect(() => {
    if (activeBlock && activeBlock.steps.length > 10 && stepGroups.length > 0 && !hasAutoCollapsed) {
      setCollapsedGroups(new Set(stepGroups.map(g => g.actionIndex)));
      setHasAutoCollapsed(true);
    }
  }, [activeBlock?.steps.length, stepGroups.length]);

  const toggleGroup = (actionIndex: number) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(actionIndex)) next.delete(actionIndex);
      else next.add(actionIndex);
      return next;
    });
  };

  const toggleBlockCollapse = (blockId: string) => {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  };

  const [renamingSuiteId, setRenamingSuiteId] = useState<string | null>(null);
  const [renamingBlockId, setRenamingBlockId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingFileNameId, setRenamingFileNameId] = useState<string | null>(null);
  const [renameFileNameValue, setRenameFileNameValue] = useState('');

  // Render step groups for the active block (reused inside block accordion)
  const renderStepGroups = () => {
    if (!activeBlock) return null;
    return (
      <>
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
        ) : null}
        {stepGroups.map((group, groupIdx) => {
          const actionStep = activeBlock.steps[group.actionIndex];
          const assertionIndices = group.indices.slice(1);
          const isCollapsed = collapsedGroups.has(group.actionIndex);
          const hasAssertions = assertionIndices.length > 0;

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
                onMoveUp={group.actionIndex > 0 ? () => onMoveStep(group.actionIndex, 'up') : undefined}
                onMoveDown={group.actionIndex < activeBlock.steps.length - 1 ? () => onMoveStep(group.actionIndex, 'down') : undefined}
                onToggle={hasAssertions ? () => toggleGroup(group.actionIndex) : undefined}
                isExpanded={!isCollapsed}
                childCount={assertionIndices.length}
              />

              {/* Nested assertions */}
              {!isCollapsed && assertionIndices.map((idx) => {
                const step = activeBlock.steps[idx];
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
                    onMoveUp={idx > 0 ? () => onMoveStep(idx, 'up') : undefined}
                    onMoveDown={idx < activeBlock.steps.length - 1 ? () => onMoveStep(idx, 'down') : undefined}
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
              ) : null}
            </React.Fragment>
          );
        })}
        {activeBlock.steps.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
            No steps yet. Use the chat to describe what to test, or start recording.
          </div>
        )}
      </>
    );
  };

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
          {/* Suite section */}
          {activeSuite && (
            <div style={{ marginBottom: 8, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Suite</span>
              </div>
              {/* Suite name row */}
              <div
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setRenameValue(activeSuite.name);
                  setRenamingSuiteId(activeSuite.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  borderRadius: 3,
                  background: 'var(--bg-tertiary)',
                  borderLeft: '2px solid var(--accent-green)',
                  marginBottom: 2,
                }}
              >
                {renamingSuiteId === activeSuite.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      if (renameValue.trim()) onRenameSuite(activeSuite.id, renameValue.trim());
                      setRenamingSuiteId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (renameValue.trim()) onRenameSuite(activeSuite.id, renameValue.trim());
                        setRenamingSuiteId(null);
                      }
                      if (e.key === 'Escape') setRenamingSuiteId(null);
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
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 'bold', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeSuite.name}
                  </span>
                )}
                <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>
                  {activeSuite.tests.length} test{activeSuite.tests.length !== 1 ? 's' : ''}
                </span>
              </div>
              {/* File name row */}
              <div
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setRenameFileNameValue(activeSuite.fileName || '');
                  setRenamingFileNameId(activeSuite.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  borderRadius: 3,
                }}
              >
                {renamingFileNameId === activeSuite.id ? (
                  <input
                    autoFocus
                    value={renameFileNameValue}
                    onChange={(e) => setRenameFileNameValue(e.target.value)}
                    onBlur={() => {
                      if (renameFileNameValue.trim()) onRenameSuiteFileName(activeSuite.id, renameFileNameValue.trim());
                      setRenamingFileNameId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (renameFileNameValue.trim()) onRenameSuiteFileName(activeSuite.id, renameFileNameValue.trim());
                        setRenamingFileNameId(null);
                      }
                      if (e.key === 'Escape') setRenamingFileNameId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      fontSize: 10,
                      background: 'var(--bg-primary)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      padding: '1px 4px',
                      outline: 'none',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeSuite.fileName}.spec.ts
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Test block list */}
          <div style={{ marginBottom: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tests</span>
              <button
                onClick={onCreateBlock}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--accent-green)',
                  borderRadius: 3,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 'bold',
                }}
              >
                + New Test
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto' }}>
              {activeSuite?.tests.map(block => (
                <div
                  key={block.id}
                  onClick={() => onSwitchBlock(block.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenameValue(block.name);
                    setRenamingBlockId(block.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    borderRadius: 3,
                    background: block.id === activeBlockId ? 'var(--bg-tertiary)' : 'transparent',
                    cursor: 'pointer',
                    borderLeft: block.id === activeBlockId ? '2px solid var(--accent-green)' : '2px solid transparent',
                  }}
                >
                  {renamingBlockId === block.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => {
                        if (renameValue.trim()) onRenameBlock(block.id, renameValue.trim());
                        setRenamingBlockId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (renameValue.trim()) onRenameBlock(block.id, renameValue.trim());
                          setRenamingBlockId(null);
                        }
                        if (e.key === 'Escape') setRenamingBlockId(null);
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
                    <span style={{ fontSize: 11, color: block.id === activeBlockId ? 'var(--text-primary)' : 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {block.name}
                    </span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>
                    {block.steps.length} step{block.steps.length !== 1 ? 's' : ''}
                  </span>
                  {activeSuite.tests.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteBlock(block.id); }}
                      style={{ background: 'none', color: 'var(--text-muted)', fontSize: 11, marginLeft: 4, padding: '0 2px' }}
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Hooks section */}
          {activeSuite && (
            <div style={{ marginBottom: 8, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hooks</span>
              </div>
              <div
                onClick={() => setBeforeEachExpanded(!beforeEachExpanded)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  borderLeft: '2px solid var(--accent-blue, #0969da)',
                  background: beforeEachExpanded ? 'var(--bg-tertiary)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--accent-blue, #0969da)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{'\u21BB'}</span>
                  <span>beforeEach</span>
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>
                  {activeSuite.beforeEach.length} step{activeSuite.beforeEach.length !== 1 ? 's' : ''}
                </span>
              </div>
              {beforeEachExpanded && (
                <div style={{ paddingLeft: 10, marginTop: 2 }}>
                  {activeSuite.beforeEach.map((step) => (
                    <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', fontSize: 11 }}>
                      <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {step.label}
                      </span>
                      <button
                        onClick={() => onRemoveBeforeEachStep(step.id)}
                        style={{ background: 'none', color: 'var(--text-muted)', fontSize: 11, padding: '0 2px' }}
                      >
                        x
                      </button>
                    </div>
                  ))}
                  {beforeEachComposerOpen ? (
                    <StepComposer
                      onSubmit={(result) => {
                        if (!('prompt' in result)) {
                          onAddBeforeEachStep(result);
                        }
                        setBeforeEachComposerOpen(false);
                      }}
                      onCancel={() => setBeforeEachComposerOpen(false)}
                    />
                  ) : null}
                </div>
              )}
            </div>
          )}

          <div style={{ height: 1, background: 'var(--border)', marginBottom: 8 }} />

          {/* Step list for active block */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {renderStepGroups()}
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
        <>
          {/* Suite management */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', fontSize: 13 }}>Suites</span>
              <button
                onClick={onCreateSuite}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--accent-green)',
                  borderRadius: 3,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 'bold',
                }}
              >
                + New Suite
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 150, overflowY: 'auto' }}>
              {suites.map(suite => (
                <div
                  key={suite.id}
                  onClick={() => { onSwitchSuite(suite.id); onSidebarModeChange('session'); }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenameValue(suite.name);
                    setRenamingSuiteId(suite.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    borderRadius: 3,
                    background: suite.id === activeSuiteId ? 'var(--bg-tertiary)' : 'transparent',
                    cursor: 'pointer',
                    borderLeft: suite.id === activeSuiteId ? '2px solid var(--accent-green)' : '2px solid transparent',
                  }}
                >
                  {renamingSuiteId === suite.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => {
                        if (renameValue.trim()) onRenameSuite(suite.id, renameValue.trim());
                        setRenamingSuiteId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (renameValue.trim()) onRenameSuite(suite.id, renameValue.trim());
                          setRenamingSuiteId(null);
                        }
                        if (e.key === 'Escape') setRenamingSuiteId(null);
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
                    <span style={{ fontSize: 11, color: suite.id === activeSuiteId ? 'var(--text-primary)' : 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {suite.name}
                    </span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>
                    {suite.tests.length} test{suite.tests.length !== 1 ? 's' : ''}
                  </span>
                  {suites.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteSuite(suite.id); }}
                      style={{
                        background: 'none',
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        marginLeft: 4,
                        padding: '0 2px',
                      }}
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 8 }} />

          {/* Saved test library */}
          <LibraryView
            entries={libraryEntries}
            onLoad={onLoadFromLibrary}
            onDelete={onDeleteFromLibrary}
            onRefresh={onRefreshLibrary}
          />
        </>
      )}
    </div>
  );
}
