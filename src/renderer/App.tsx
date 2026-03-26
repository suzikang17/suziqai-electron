import React, { useState, useRef, useEffect } from 'react';
import type { Step, TestCase, ChatMessage, AppMode } from '@shared/types';
import { ProjectSetup } from './components/ProjectSetup';
import { StepSidebar } from './components/StepSidebar';
import { ChatPanel } from './components/ChatPanel';
import { BrowserToolbar } from './components/BrowserToolbar';

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
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [chatHeight, setChatHeight] = useState(200);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  const updateCurrentTest = (updater: (test: TestCase) => TestCase) => {
    setTests(prev => prev.map(t => t.id === activeTestId ? updater(t) : t));
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

  // Listen for URL changes, chat responses, steps, and step results from the main process
  useEffect(() => {
    // Clean up any existing listeners first
    window.suziqai.removeAllListeners('browser:url-changed');
    window.suziqai.removeAllListeners('chat:response');
    window.suziqai.removeAllListeners('steps:proposed');
    window.suziqai.removeAllListeners('step:result');

    window.suziqai.onUrlChanged((url) => {
      setCurrentUrl(url);
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
      setTests(prev => prev.map(t => t.id === activeTestId ? {
        ...t,
        steps: [...t.steps, ...steps],
      } : t));
    });

    window.suziqai.onStepResult((stepId, status, error) => {
      setTests(prev => prev.map(t => t.id === activeTestId ? {
        ...t,
        steps: t.steps.map(s =>
          s.id === stepId ? { ...s, status: status as any, error } : s
        ),
      } : t));
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

  if (!projectPath) {
    return <ProjectSetup onProjectOpened={(path, _baseUrl) => setProjectPath(path)} />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left: Step Sidebar */}
      <div style={{ width: sidebarWidth, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        {/* Project header */}
        <div
          onClick={() => setProjectPath(null)}
          style={{
            padding: '8px 10px',
            borderBottom: '1px solid var(--border)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ color: 'var(--accent-yellow)', fontSize: 11 }}>📁</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {projectPath?.split('/').pop()}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>change</span>
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
          onRunAll={() => {
            const pendingSteps = currentTest.steps
              .filter(s => s.status === 'pending' || s.status === 'passed')
              .map(s => ({ id: s.id, action: s.action }));
            window.suziqai.executeAllSteps(pendingSteps);
          }}
          onExport={() => {
            window.suziqai.showSaveDialog(`${currentTest.name}.spec.ts`).then(path => {
              if (path) window.suziqai.exportTest(currentTest.id, path);
            });
          }}
        />
      </div>

      {/* Right: Browser + Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top: Browser Toolbar + Viewport */}
        <BrowserToolbar
          url={currentUrl}
          mode={mode}
          isRecording={isRecording}
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

        {/* Bottom: Chat Panel */}
        <div style={{ height: chatHeight, borderTop: '1px solid var(--border)' }}>
          <ChatPanel
            messages={messages}
            mode={mode}
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
