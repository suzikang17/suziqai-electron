import React, { useState, useRef, useEffect } from 'react';
import type { Step, TestCase, ChatMessage, AppMode } from '@shared/types';
import { ProjectSetup } from './components/ProjectSetup';
import { StepSidebar } from './components/StepSidebar';
import { ChatPanel } from './components/ChatPanel';
import { BrowserToolbar } from './components/BrowserToolbar';

export function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>('command');
  const [currentTest, setCurrentTest] = useState<TestCase>({
    id: '1',
    name: 'Untitled Test',
    steps: [],
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [chatHeight, setChatHeight] = useState(200);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

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
      setCurrentTest(prev => ({
        ...prev,
        steps: [...prev.steps, ...steps],
      }));
    });

    window.suziqai.onStepResult((stepId, status, error) => {
      setCurrentTest(prev => ({
        ...prev,
        steps: prev.steps.map(s =>
          s.id === stepId ? { ...s, status: status as any, error } : s
        ),
      }));
    });

    return () => {
      window.suziqai.removeAllListeners('browser:url-changed');
      window.suziqai.removeAllListeners('chat:response');
      window.suziqai.removeAllListeners('steps:proposed');
      window.suziqai.removeAllListeners('step:result');
    };
  }, []);

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
          testCase={currentTest}
          onAcceptStep={(stepId: string) => {
            const step = currentTest.steps.find(s => s.id === stepId);
            if (step) {
              window.suziqai.executeStep(stepId, step.action);
            }
          }}
          onDenyStep={(stepId: string) => {
            setCurrentTest(prev => ({
              ...prev,
              steps: prev.steps.filter(s => s.id !== stepId),
            }));
          }}
          onResetStep={(stepId: string) => {
            setCurrentTest(prev => ({
              ...prev,
              steps: prev.steps.map(s =>
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
