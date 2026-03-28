import React, { useState, useRef, useEffect } from 'react';
import type { Step, TestCase, ChatMessage, AppMode, LibraryEntry } from '@shared/types';
import { ProjectSetup } from './components/ProjectSetup';
import { StepSidebar } from './components/StepSidebar';
import { ChatPanel } from './components/ChatPanel';
import { BrowserToolbar } from './components/BrowserToolbar';
import { CodePreview } from './components/CodePreview';
import { SelectorPopover } from './components/SelectorPopover';
import { generateSpec, generateSpecFilename } from '@shared/utils/generateSpec';

export function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>('command');
  const [tests, setTests] = useState<TestCase[]>([{
    id: '1',
    name: 'Untitled Test',
    steps: [],
  }]);
  const [activeTestId, setActiveTestId] = useState<string>('1');
  const currentTest = tests.find(t => t.id === activeTestId) || tests[0];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [pickedSelectors, setPickedSelectors] = useState<Array<{ type: string; selector: string; confidence: string }> | null>(null);
  const [pickedElement, setPickedElement] = useState<{ tag: string; text: string; id: string | null } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [chatHeight, setChatHeight] = useState(200);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [isAutopilot, setIsAutopilot] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'session' | 'library'>('session');
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const autopilotRef = useRef(false);
  const autopilotRetriesRef = useRef(0);
  const AUTOPILOT_MAX_RETRIES = 3;
  useEffect(() => { autopilotRef.current = isAutopilot; if (!isAutopilot) autopilotRetriesRef.current = 0; }, [isAutopilot]);
  const [showSettings, setShowSettings] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [isAutoLoading, setIsAutoLoading] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Auto-load last project on startup
  useEffect(() => {
    window.suziqai.getLastProject().then(async (last) => {
      if (last) {
        try {
          const parsed = JSON.parse(last);
          if (parsed.path) {
            setBaseUrl(parsed.url || 'http://localhost:3000');
            await window.suziqai.openProject(parsed.path, parsed.url);
            setProjectPath(parsed.path);
          }
        } catch {
          // Old format or invalid — show setup screen
        }
      }
      setIsAutoLoading(false);
    });
  }, []);

  const updateCurrentTest = (updater: (test: TestCase) => TestCase) => {
    setTests(prev => prev.map(t => t.id === activeTestId ? updater(t) : t));
  };

  const log = (content: string, role: 'assistant' | 'system' = 'system' as any) => {
    setMessages(prev => [...prev, {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role,
      content,
      timestamp: Date.now(),
    }]);
  };

  const createNewTest = () => {
    const newTest: TestCase = {
      id: `test-${Date.now()}`,
      name: 'Untitled Test',
      steps: [],
    };
    setTests(prev => [...prev, newTest]);
    setActiveTestId(newTest.id);
  };

  const renameTest = (testId: string, name: string) => {
    setTests(prev => prev.map(t => t.id === testId ? { ...t, name } : t));
  };

  const deleteTest = (testId: string) => {
    setTests(prev => {
      const filtered = prev.filter(t => t.id !== testId);
      if (filtered.length === 0) {
        const newTest: TestCase = { id: `test-${Date.now()}`, name: 'Untitled Test', steps: [] };
        if (activeTestId === testId) setActiveTestId(newTest.id);
        return [newTest];
      }
      if (activeTestId === testId) {
        setActiveTestId(filtered[0].id);
      }
      return filtered;
    });
  };

  const refreshLibrary = async () => {
    const entries = await window.suziqai.listLibrary();
    setLibraryEntries(entries);
  };

  const saveTest = async () => {
    const test = tests.find(t => t.id === activeTestId);
    if (!test) return;
    try {
      const result = await window.suziqai.saveToLibrary(test);
      log(`Saved "${test.name}" → ${result.fileName}.spec.ts`);
    } catch (err) {
      log(`Save failed: ${(err as Error).message}`);
    }
  };

  const loadFromLibrary = async (fileName: string) => {
    try {
      const loaded = await window.suziqai.loadFromLibrary(fileName);
      const newTest: TestCase = {
        ...loaded,
        id: `test-${Date.now()}`,
      };
      setTests(prev => [...prev, newTest]);
      setActiveTestId(newTest.id);
      setSidebarMode('session');
      log(`Loaded "${loaded.name}" from library`);
    } catch (err) {
      log(`Load failed: ${(err as Error).message}`);
    }
  };

  const deleteFromLibrary = async (fileName: string) => {
    try {
      await window.suziqai.deleteFromLibrary(fileName);
      await refreshLibrary();
      log(`Deleted "${fileName}" from library`);
    } catch (err) {
      log(`Delete failed: ${(err as Error).message}`);
    }
  };

  // Listen for URL changes, chat responses, steps, and step results from the main process
  useEffect(() => {
    // Clean up any existing listeners first
    window.suziqai.removeAllListeners('browser:url-changed');
    window.suziqai.removeAllListeners('chat:response');
    window.suziqai.removeAllListeners('steps:proposed');
    window.suziqai.removeAllListeners('step:result');

    window.suziqai.onUrlChanged((url) => {
      setCurrentUrl(url);
      log(`Navigated → ${url}`);
    });

    window.suziqai.onChatResponse((message) => {
      setIsChatLoading(false);
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'assistant' as const,
        content: message,
        timestamp: Date.now(),
      }]);
    });

    window.suziqai.onStepsProposed((steps) => {
      setTests(prev => prev.map(t => {
        if (t.id !== activeTestId) return t;
        const newSteps = [...t.steps];
        if (insertAtIndex !== null && insertAtIndex <= newSteps.length) {
          newSteps.splice(insertAtIndex, 0, ...steps);
        } else {
          newSteps.push(...steps);
        }
        return { ...t, steps: newSteps };
      }));
      setInsertAtIndex(null); // reset after insert
      log(`${(steps as any[]).length} step(s) added`);

      // Autopilot: auto-execute newly added steps (skip QA-suggested steps to prevent infinite loops)
      if (autopilotRef.current) {
        const executableSteps = (steps as any[]).filter((s: any) => !s._fromVisualQA);
        if (executableSteps.length > 0) {
          const stepsToRun = executableSteps.map((s: any) => ({ id: s.id, action: s.action }));
          log(`⚡ Autopilot: running ${stepsToRun.length} step(s)...`);
          window.suziqai.executeAllSteps(stepsToRun);
        }
      }
    });

    window.suziqai.onStepResult((stepId, status, error) => {
      setTests(prev => {
        const updated = prev.map(t => t.id === activeTestId ? {
          ...t,
          steps: t.steps.map(s =>
            s.id === stepId ? { ...s, status: status as any, error } : s
          ),
        } : t);
        // Log the result
        const test = updated.find(t => t.id === activeTestId);
        const step = test?.steps.find(s => s.id === stepId);
        if (step) {
          const icon = status === 'passed' ? '✓' : status === 'failed' ? '✗' : '●';
          const msg = `${icon} ${step.label}` + (error ? ` — ${error}` : '');
          log(msg);
        }

        // Autopilot: on failure, ask AI for diagnosis (with retry limit)
        if (autopilotRef.current && status === 'failed' && step) {
          autopilotRetriesRef.current++;
          if (autopilotRetriesRef.current > AUTOPILOT_MAX_RETRIES) {
            log(`⚡ Autopilot: hit ${AUTOPILOT_MAX_RETRIES} retries — pausing autopilot`);
            setIsAutopilot(false);
          } else {
            const prompt = `Step failed (retry ${autopilotRetriesRef.current}/${AUTOPILOT_MAX_RETRIES}): "${step.label}"\nError: ${error}\n\nLook at the current screenshot and suggest an alternative approach. Either fix the selector/action or propose different steps to accomplish the same goal.`;
            log(`⚡ Autopilot: diagnosing failure (${autopilotRetriesRef.current}/${AUTOPILOT_MAX_RETRIES})...`);
            setIsChatLoading(true);
            window.suziqai.sendChat(prompt);
          }
        }

        // Reset retry counter on success
        if (autopilotRef.current && status === 'passed') {
          autopilotRetriesRef.current = 0;
        }

        return updated;
      });
    });

    return () => {
      window.suziqai.removeAllListeners('browser:url-changed');
      window.suziqai.removeAllListeners('chat:response');
      window.suziqai.removeAllListeners('steps:proposed');
      window.suziqai.removeAllListeners('step:result');
    };
  }, [activeTestId]);

  // Report viewport bounds to main process so BrowserView can be positioned
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateBounds = () => {
      const rect = el.getBoundingClientRect();
      window.suziqai.setViewportBounds({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    };

    const observer = new ResizeObserver(updateBounds);
    observer.observe(el);
    updateBounds();

    return () => observer.disconnect();
  }, [projectPath]);

  // Load saved session when project opens
  useEffect(() => {
    if (!projectPath) return;
    window.suziqai.loadSession().then((data) => {
      if (data) {
        if (data.messages) setMessages(data.messages);
        if (data.tests) {
          setTests(data.tests);
          setActiveTestId(data.activeTestId || data.tests[0]?.id || '1');
        } else if (data.currentTest) {
          // Backwards compat with old session format
          setTests([data.currentTest]);
          setActiveTestId(data.currentTest.id);
        }
      }
    });
  }, [projectPath]);

  // Save session when state changes
  useEffect(() => {
    if (!projectPath) return;
    const timeout = setTimeout(() => {
      window.suziqai.saveSession({
        messages,
        tests,
        activeTestId,
      });
    }, 500); // debounce 500ms
    return () => clearTimeout(timeout);
  }, [messages, tests, activeTestId, projectPath]);

  // Listen for picker results
  useEffect(() => {
    window.suziqai.removeAllListeners('picker:result');
    window.suziqai.onPickerResult((data: any) => {
      log(`Picked <${data.element?.tag}> "${data.element?.text?.substring(0, 40) || ''}" — ${data.selectors.length} selectors`);
      setPickedSelectors(data.selectors);
      setPickedElement(data.element);
    });
    return () => {
      window.suziqai.removeAllListeners('picker:result');
    };
  }, []);

  useEffect(() => {
    if (sidebarMode === 'library') {
      refreshLibrary();
    }
  }, [sidebarMode]);

  const togglePicker = async () => {
    if (isPicking) {
      await window.suziqai.stopPicker();
      setIsPicking(false);
      setPickedSelectors(null);
      setPickedElement(null);
    } else {
      await window.suziqai.startPicker();
      setIsPicking(true);
    }
  };

  if (isAutoLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</span>
      </div>
    );
  }

  if (!projectPath) {
    return <ProjectSetup onProjectOpened={(path, url) => {
      setBaseUrl(url || 'http://localhost:3000');
      setProjectPath(path);
    }} />;
  }

  const startDragSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(500, startWidth + ev.clientX - startX));
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startDragChat = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = chatHeight;
    const onMove = (ev: MouseEvent) => {
      const newHeight = Math.max(100, Math.min(600, startHeight - (ev.clientY - startY)));
      setChatHeight(newHeight);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left: Step Sidebar */}
      <div style={{ width: sidebarWidth, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Project header + settings */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '8px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 11 }}>⚙</span>
            <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {projectPath?.split('/').pop()}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>{showSettings ? '▲' : '▼'}</span>
          </div>
          {showSettings && (
            <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Project</span>
                <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 2, wordBreak: 'break-all' }}>
                  {projectPath}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>App URL</span>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  onBlur={() => {
                    // Navigate BrowserView to new URL
                    window.suziqai.navigate(baseUrl);
                    window.suziqai.setLastProject(JSON.stringify({ path: projectPath, url: baseUrl }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      window.suziqai.navigate(baseUrl);
                      window.suziqai.setLastProject(JSON.stringify({ path: projectPath, url: baseUrl }));
                    }
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 2,
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    borderRadius: 4,
                    padding: '4px 8px',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>
              <button
                onClick={() => setProjectPath(null)}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 10,
                  textAlign: 'center',
                }}
              >
                Switch Project
              </button>
            </div>
          )}
        </div>
        <StepSidebar
          tests={tests}
          activeTestId={activeTestId}
          onSwitchTest={setActiveTestId}
          onCreateTest={createNewTest}
          onRenameTest={renameTest}
          onDeleteTest={deleteTest}
          onAcceptStep={(stepId: string) => {
            const step = currentTest.steps.find(s => s.id === stepId);
            if (step) {
              log(`▶ Running: ${step.label}`);
              window.suziqai.executeStep(stepId, step.action);
            }
          }}
          onDenyStep={(stepId: string) => {
            updateCurrentTest(t => ({
              ...t,
              steps: t.steps.filter(s => s.id !== stepId),
            }));
          }}
          onResetStep={(stepId: string) => {
            updateCurrentTest(t => ({
              ...t,
              steps: t.steps.map(s =>
                s.id === stepId ? { ...s, status: 'pending' as const, error: undefined } : s
              ),
            }));
          }}
          onUpdateStep={(stepId: string, action: any, label: string) => {
            updateCurrentTest(t => ({
              ...t,
              steps: t.steps.map(s =>
                s.id === stepId ? { ...s, action, label, status: 'pending' as const, error: undefined } : s
              ),
            }));
          }}
          onInsertStep={(index: number, step: { label: string; action: any }) => {
            setTests(prev => prev.map(t => {
              if (t.id !== activeTestId) return t;
              const newSteps = [...t.steps];
              newSteps.splice(index, 0, {
                id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                label: step.label,
                action: step.action,
                status: 'pending' as const,
              });
              return { ...t, steps: newSteps };
            }));
          }}
          onInsertPrompt={(index: number, prompt: string) => {
            setInsertAtIndex(index);
            setIsChatLoading(true);
            window.suziqai.sendChat(prompt);
          }}
          onRunActAndAssert={() => {
            const actions = currentTest.steps
              .filter(s => (s.status === 'pending' || s.status === 'passed') && s.action.type !== 'assert' && s.action.type !== 'waitFor');
            const assertions = currentTest.steps
              .filter(s => (s.status === 'pending' || s.status === 'passed') && (s.action.type === 'assert' || s.action.type === 'waitFor'));
            const ordered = [...actions, ...assertions].map(s => ({ id: s.id, action: s.action }));
            log(`▶▶ Act & Assert: ${actions.length} action(s), then ${assertions.length} assertion(s)`);
            window.suziqai.executeAllSteps(ordered);
          }}
          onRunGroup={(stepIds: string[]) => {
            const stepsToRun = currentTest.steps
              .filter(s => stepIds.includes(s.id))
              .map(s => ({ id: s.id, action: s.action }));
            log(`▶▶ Act & Assert: running ${stepsToRun.length} step(s)`);
            window.suziqai.executeAllSteps(stepsToRun);
          }}
          onRunAll={() => {
            const pendingSteps = currentTest.steps
              .filter(s => s.status === 'pending' || s.status === 'passed')
              .map(s => ({ id: s.id, action: s.action }));
            log(`▶▶ Running all ${pendingSteps.length} steps...`);
            window.suziqai.executeAllSteps(pendingSteps);
          }}
          onExport={() => {
            window.suziqai.showSaveDialog(`${currentTest.name}.spec.ts`).then(path => {
              if (path) window.suziqai.exportTest(currentTest.id, path);
            });
          }}
          sidebarMode={sidebarMode}
          onSidebarModeChange={setSidebarMode}
          onSaveTest={saveTest}
          libraryEntries={libraryEntries}
          onLoadFromLibrary={loadFromLibrary}
          onDeleteFromLibrary={deleteFromLibrary}
          onRefreshLibrary={refreshLibrary}
        />
      </div>

      {/* Sidebar resize handle */}
      <div
        onMouseDown={startDragSidebar}
        style={{
          width: 4,
          cursor: 'col-resize',
          background: 'var(--border)',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-blue, #0969da)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--border)')}
      />

      {/* Right: Browser + Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top: Browser Toolbar + Viewport */}
        <BrowserToolbar
          url={currentUrl}
          mode={mode}
          isRecording={isRecording}
          isPicking={isPicking}
          onNavigate={(url: string) => window.suziqai.navigate(url)}
          onModeChange={(newMode: AppMode) => {
            setMode(newMode);
            window.suziqai.changeMode(newMode);
          }}
          onRecordToggle={() => {
            if (isRecording) {
              window.suziqai.stopRecording();
            } else {
              window.suziqai.startRecording();
            }
            setIsRecording(!isRecording);
          }}
          onPickToggle={togglePicker}
          isAutopilot={isAutopilot}
          onAutopilotToggle={() => setIsAutopilot(!isAutopilot)}
        />
        {/* Browser viewport area — BrowserView is positioned here by main process */}
        <div
          ref={viewportRef}
          id="browser-viewport"
          style={{
            flex: 1,
            background: 'var(--bg-dark)',
            position: 'relative',
          }}
        />

        {/* Chat resize handle */}
        <div
          onMouseDown={startDragChat}
          style={{
            height: 4,
            cursor: 'row-resize',
            background: 'var(--border)',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-blue, #0969da)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--border)')}
        />

        {/* Bottom: Chat Panel */}
        <div style={{ height: chatHeight }}>
          <ChatPanel
            messages={messages}
            mode={mode}
            isLoading={isChatLoading}
            pickerResult={pickedSelectors ? { selectors: pickedSelectors, element: pickedElement } : null}
            onPickSelector={(selector, element) => {
              window.suziqai.copyToClipboard(selector);
              setTests(prev => prev.map(t => {
                if (t.id !== activeTestId) return t;
                return { ...t, steps: [...t.steps, {
                  id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  label: `Click '${element?.text?.substring(0, 30) || selector}'`,
                  action: { type: 'click' as const, selector },
                  status: 'pending' as const,
                }]};
              }));
              setPickedSelectors(null);
              setPickedElement(null);
            }}
            onDismissPicker={() => {
              setPickedSelectors(null);
              setPickedElement(null);
            }}
            onAskAiSelector={(selectors, element) => {
              const selectorList = selectors.map((s: any) => `[${s.confidence}] ${s.selector}`).join('\n');
              const prompt = `I picked this element and got these selector candidates. Which is the best selector for a robust, reliable Playwright test? Consider uniqueness, stability across code changes, and Playwright best practices.\n\nElement: <${element?.tag}> "${element?.text?.substring(0, 60) || ''}"\nDOM Context:\n${element?.domContext || 'N/A'}\n\nSelector candidates:\n${selectorList}\n\nRecommend the best selector and explain why in 1-2 sentences.`;
              setIsChatLoading(true);
              window.suziqai.sendChat(prompt);
              setPickedSelectors(null);
              setPickedElement(null);
            }}
            onSend={(content: string) => {
              const userMsg: ChatMessage = {
                id: Date.now().toString(),
                role: 'user',
                content,
                timestamp: Date.now(),
              };
              setMessages(prev => [...prev, userMsg]);
              setIsChatLoading(true);
              window.suziqai.sendChat(content);
            }}
            isLoading={isChatLoading}
          />
        </div>
      </div>
    </div>
  );
}
