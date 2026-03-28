import React, { useState } from 'react';
import { StepItem } from './StepItem';
import { StepComposer } from './StepComposer';
import { LibraryView } from './LibraryView';
import type { TestSuite, StepAction } from '@shared/types';
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
        <span>+ insert step here</span>
      </div>
    </div>
  );
}

interface StepSidebarProps {
  suites: TestSuite[];
  activeSuiteId: string;
  activeBlockId: string;
  onSwitchSuite: (suiteId: string) => void;
  onSwitchBlock: (blockId: string) => void;
  onCreateSuite: () => void;
  onCreateBlock: () => void;
  onRenameSuite: (suiteId: string, name: string) => void;
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
  suites,
  activeSuiteId,
  activeBlockId,
  onSwitchSuite,
  onSwitchBlock,
  onCreateSuite,
  onCreateBlock,
  onRenameSuite,
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
  const activeSuite = suites.find(s => s.id === activeSuiteId) || suites[0];
  const activeBlock = activeSuite?.tests.find(b => b.id === activeBlockId) || activeSuite?.tests[0];

  const [composerAt, setComposerAt] = useState<number | null>(null);
  const [beforeEachComposerOpen, setBeforeEachComposerOpen] = useState(false);
  const [dragFromGroup, setDragFromGroup] = useState<number | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<number | null>(null);
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
        ) : (
          <InsertButton onClick={() => setComposerAt(0)} />
        )}
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
                onToggle={hasAssertions ? () => toggleGroup(group.actionIndex) : undefined}
                isExpanded={!isCollapsed}
                childCount={assertionIndices.length}
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragFromGroup(groupIdx); }}
                onDragOver={(e) => { e.preventDefault(); setDragOverGroup(groupIdx); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFromGroup !== null && dragFromGroup !== groupIdx) {
                    const fromGroup = stepGroups[dragFromGroup];
                    const fromIds = fromGroup.indices.map(i => activeBlock.steps[i].id);
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
          {/* Active suite header */}
          {activeSuite && (
            <div style={{ marginBottom: 8 }}>
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
            </div>
          )}
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 8 }} />

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* beforeEach section */}
            {activeSuite && (
              <div style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setBeforeEachExpanded(!beforeEachExpanded)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    borderLeft: '2px solid var(--accent-blue, #0969da)',
                    borderRadius: 3,
                    background: 'var(--bg-tertiary)',
                    marginBottom: 2,
                  }}
                >
                  <span style={{ fontSize: 10, color: 'var(--accent-blue, #0969da)' }}>
                    {beforeEachExpanded ? '\u25BE' : '\u25B8'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--accent-blue, #0969da)' }}>
                    {'\u21BB'}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-blue, #0969da)', flex: 1 }}>
                    beforeEach ({activeSuite.beforeEach.length} step{activeSuite.beforeEach.length !== 1 ? 's' : ''})
                  </span>
                </div>
                {beforeEachExpanded && (
                  <div style={{ paddingLeft: 10 }}>
                    {activeSuite.beforeEach.map((step, idx) => (
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
                    ) : (
                      <InsertButton onClick={() => setBeforeEachComposerOpen(true)} />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Test blocks */}
            {activeSuite?.tests.map((block) => {
              const isActive = block.id === activeBlockId;
              const isBlockCollapsed = collapsedBlocks.has(block.id) || !isActive;

              return (
                <div key={block.id} style={{ marginBottom: 4 }}>
                  {/* Block header */}
                  <div
                    onClick={() => {
                      onSwitchBlock(block.id);
                      if (collapsedBlocks.has(block.id)) {
                        toggleBlockCollapse(block.id);
                      }
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenameValue(block.name);
                      setRenamingBlockId(block.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      cursor: 'pointer',
                      borderLeft: isActive ? '2px solid var(--accent-green)' : '2px solid transparent',
                      borderRadius: 3,
                      background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                      marginBottom: 2,
                    }}
                  >
                    <span
                      onClick={(e) => { e.stopPropagation(); if (isActive) toggleBlockCollapse(block.id); else { onSwitchBlock(block.id); } }}
                      style={{ fontSize: 10, color: 'var(--accent-green)' }}
                    >
                      {isBlockCollapsed ? '\u25B8' : '\u25BE'}
                    </span>
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
                      <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? 'var(--accent-green)' : 'var(--text-secondary)', flex: 1 }}>
                        test: {block.name} ({block.steps.length} step{block.steps.length !== 1 ? 's' : ''})
                      </span>
                    )}
                    {activeSuite.tests.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteBlock(block.id); }}
                        style={{ background: 'none', color: 'var(--text-muted)', fontSize: 11, padding: '0 2px' }}
                      >
                        x
                      </button>
                    )}
                  </div>

                  {/* Block steps (only rendered if this is the active, expanded block) */}
                  {isActive && !isBlockCollapsed && (
                    <div style={{ paddingLeft: 10 }}>
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
                      {renderStepGroups()}
                    </div>
                  )}
                </div>
              );
            })}

            {/* + New Test button */}
            <button
              onClick={onCreateBlock}
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--accent-green)',
                borderRadius: 3,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 'bold',
                marginTop: 4,
                textAlign: 'left',
              }}
            >
              + New Test
            </button>
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
