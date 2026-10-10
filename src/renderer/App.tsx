import React, { useState, useRef, useEffect } from 'react';
import type { Step, TestCase, TestBlock, TestSuite, ChatMessage, AppMode, LibraryEntry, PlaywrightConfig } from '@shared/types';
import { migrateToSuite } from '@shared/utils/migrateSuite';
import { defaultPlaywrightConfig } from '@shared/utils/generatePlaywrightConfig';
import { ProjectSetup } from './components/ProjectSetup';
import { StepSidebar } from './components/StepSidebar';
import { ChatPanel } from './components/ChatPanel';
import { BrowserToolbar } from './components/BrowserToolbar';
import { CodePreview } from './components/CodePreview';
import { SelectorPopover } from './components/SelectorPopover';
import { VideoImport } from './components/VideoImport';
import { generateSpec, generateSpecFilename } from '@shared/utils/generateSpec';
import { buildRunSequence } from '@shared/utils/runSequence';
import { FeaturePlanPanel, type ScenarioStatus } from './components/FeaturePlanPanel';
import type { FeaturePlan } from '@shared/types';

export function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  // 'ios' projects show simulator screenshots in place of the BrowserView
  const [platform, setPlatform] = useState<'web' | 'ios'>('web');
  const [iosScreen, setIosScreen] = useState('');
  // Watch mode replays slowly, showing each target before acting
  const [watchMode, setWatchMode] = useState(false);
  const [goalRunning, setGoalRunning] = useState(false);
  // Feature mode: a reviewed plan of scenarios, each run as a goal in its own test block
  const [featurePlan, setFeaturePlan] = useState<FeaturePlan | null>(null);
  const [featureStatuses, setFeatureStatuses] = useState<Record<string, ScenarioStatus>>({});
  const [featureRunning, setFeatureRunning] = useState(false);
  const [tapMarker, setTapMarker] = useState<{ frame: number[]; screen: number[]; label: string } | null>(null);
  const [mode, setMode] = useState<AppMode>('command');
  const defaultBlock: TestBlock = { id: 'block-1', name: 'Untitled Test', steps: [] };
  const defaultSuite: TestSuite = { id: 'suite-1', name: 'Untitled Suite', fileName: 'untitled-suite', beforeAll: [], beforeEach: [], afterEach: [], afterAll: [], tests: [defaultBlock], devices: [] };
  const [suites, setSuites] = useState<TestSuite[]>([defaultSuite]);
  const [activeSuiteId, setActiveSuiteId] = useState<string>('suite-1');
  const [activeBlockId, setActiveBlockId] = useState<string>('block-1');
  const currentSuite = suites.find(s => s.id === activeSuiteId) || suites[0];
  const currentBlock = currentSuite?.tests.find(b => b.id === activeBlockId) || currentSuite?.tests[0];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [pickedSelectors, setPickedSelectors] = useState<Array<{ type: string; selector: string; confidence: string }> | null>(null);
  const [pickedElement, setPickedElement] = useState<{ tag: string; text: string; id: string | null } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [chatHeight, setChatHeight] = useState(200);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [isAutopilot, setIsAutopilot] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'session' | 'library'>('session');
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [playwrightConfig, setPlaywrightConfig] = useState<PlaywrightConfig>(() =>
    defaultPlaywrightConfig('http://localhost:3000', './tests')
  );
  const [previewDevice, setPreviewDevice] = useState<string>('Desktop Chrome');
  const [showVideoImport, setShowVideoImport] = useState(false);

  const DEVICE_VIEWPORTS: Record<string, { width: number; height: number }> = {
    'iPhone 15 Pro': { width: 393, height: 659 },
    'iPhone 14': { width: 390, height: 664 },
    'iPad Pro 11': { width: 834, height: 1194 },
    'Pixel 7': { width: 412, height: 839 },
    'Galaxy S24': { width: 360, height: 780 },
    'Desktop Chrome': { width: 1280, height: 720 },
    'Desktop Safari': { width: 1280, height: 720 },
    'Desktop Firefox': { width: 1280, height: 720 },
  };

  const getDeviceViewport = (device: string): { width: number; height: number } | null => {
    // Check suite's custom device configs first
    const suiteDevice = currentSuite?.devices?.find(d => d.name === device);
    if (suiteDevice?.viewport) return suiteDevice.viewport;
    return DEVICE_VIEWPORTS[device] || null;
  };

  const autopilotRef = useRef(false);
  const autopilotRetriesRef = useRef(0);
  const AUTOPILOT_MAX_RETRIES = 3;
  useEffect(() => { autopilotRef.current = isAutopilot; if (!isAutopilot) autopilotRetriesRef.current = 0; }, [isAutopilot]);

  const [isDirty, setIsDirty] = useState(false);
  const lastSavedRef = useRef<string>('');

  // Auto-save spec file when suite changes (debounced 1s)
  useEffect(() => {
    if (!projectPath || !currentSuite) return;
    const suiteJson = JSON.stringify(currentSuite);
    if (suiteJson === lastSavedRef.current) return; // no change
    if (!isDirty) return;

    const timeout = setTimeout(async () => {
      try {
        const hasProjects = playwrightConfig?.projects?.length > 0;
        await window.suziqai.saveToLibrary(currentSuite, undefined, hasProjects);
        lastSavedRef.current = suiteJson;
        setIsDirty(false);
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [currentSuite, isDirty, projectPath]);
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
            const url = parsed.url || 'http://localhost:3000';
            setBaseUrl(url);
            const config = await window.suziqai.openProject(parsed.path, parsed.url, parsed.ios);
            setPlatform(config?.platform ?? 'web');
            setProjectPath(parsed.path);
            // Initialize playwright config with project's base URL and test dir
            setPlaywrightConfig(prev => ({ ...prev, baseURL: url }));
          }
        } catch {
          // Old format or invalid — show setup screen
        }
      }
      setIsAutoLoading(false);
    });
  }, []);

  // iOS: live simulator screen, and selectors Jev resolved while running steps
  useEffect(() => {
    window.suziqai.onIosScreenshot((png) => { setIosScreen(png); setTapMarker(null); });
    window.suziqai.onIosTapMarker((marker) => setTapMarker(marker));
    window.suziqai.onStepResolved((stepId, selector) => {
      const withSelector = (steps: Step[]) => steps.map(st =>
        st.id === stepId && 'selector' in st.action ? { ...st, action: { ...st.action, selector } as Step['action'] } : st);
      setSuites(prev => prev.map(s => ({
        ...s,
        beforeEach: withSelector(s.beforeEach),
        tests: s.tests.map(b => ({ ...b, steps: withSelector(b.steps) })),
      })));
    });
  }, []);

  /** Runs the selected scenarios one after another, each as a goal in a new test block, then reports coverage. */
  const runFeaturePlan = async (ids: string[]) => {
    if (!featurePlan || !currentSuite) return;
    const suiteId = activeSuiteId;
    const setup = [...currentSuite.beforeAll, ...currentSuite.beforeEach].map(s => ({ id: s.id, label: s.label, action: s.action }));
    setFeatureRunning(true);
    const results: Record<string, ScenarioStatus> = {};
    const stepCounts: Record<string, number> = {};
    for (const sc of featurePlan.scenarios) {
      if (!ids.includes(sc.id)) {
        results[sc.id] = sc.runnable === 'now' ? 'skipped' : 'needs-sandbox';
        setFeatureStatuses({ ...results });
        continue;
      }
      const blockId = `block-${Date.now()}`;
      setSuites(prev => prev.map(s => s.id !== suiteId ? s : { ...s, tests: [...s.tests, { id: blockId, name: sc.name, steps: [] }] }));
      setActiveBlockId(blockId);
      results[sc.id] = 'running';
      setFeatureStatuses({ ...results });
      await new Promise(r => setTimeout(r, 300)); // let listeners re-register for the new block
      log(`🧪 Scenario: ${sc.name}`);
      const result = await window.suziqai.runGoal(sc.goal, setup).catch(() => null);
      results[sc.id] = !result ? 'error'
        : result.status === 'done' ? (result.verified ? 'verified' : 'unverified')
        : result.status === 'stopped' ? 'stopped' : 'stuck';
      stepCounts[sc.id] = result?.steps.length ?? 0;
      setFeatureStatuses({ ...results });
      if (result?.status === 'stopped') break;
    }
    const count = (st: ScenarioStatus) => Object.values(results).filter(v => v === st).length;
    log(`📊 Feature coverage for "${featurePlan.feature}": ${count('verified')} verified, ${count('unverified')} done but not verified, ${count('stuck')} stuck, ${count('needs-sandbox')} need a sandbox, ${count('skipped')} skipped`);
    for (const sc of featurePlan.scenarios) {
      const st = results[sc.id] ?? 'skipped';
      const icon = st === 'verified' ? '✅' : st === 'unverified' ? '⚠️' : st === 'stuck' || st === 'error' ? '🛑' : st === 'needs-sandbox' ? '🏖' : '–';
      log(`  ${icon} ${sc.name}${stepCounts[sc.id] ? ` (${stepCounts[sc.id]} steps)` : ''}${st === 'needs-sandbox' ? ' — writes data; needs a sandbox' : ''}`);
    }
    setFeatureRunning(false);
  };

  const updateCurrentBlock = (updater: (block: TestBlock) => TestBlock) => {
    setSuites(prev => prev.map(s => s.id !== activeSuiteId ? s : {
      ...s,
      tests: s.tests.map(b => b.id === activeBlockId ? updater(b) : b),
    }));
  };

  const updateCurrentSuite = (updater: (suite: TestSuite) => TestSuite) => {
    setSuites(prev => prev.map(s => s.id === activeSuiteId ? updater(s) : s));
  };

  const log = (content: string, role: 'assistant' | 'system' = 'system') => {
    setMessages(prev => [...prev, {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role,
      content,
      timestamp: Date.now(),
    }]);
  };

  const createNewSuite = () => {
    const blockId = `block-${Date.now()}`;
    const suiteId = `suite-${Date.now()}`;
    const newSuite: TestSuite = {
      id: suiteId,
      name: 'Untitled Suite',
      fileName: 'untitled-suite',
      beforeAll: [],
      beforeEach: [],
      afterEach: [],
      afterAll: [],
      tests: [{ id: blockId, name: 'Untitled Test', steps: [] }],
      devices: [],
    };
    setSuites(prev => [...prev, newSuite]);
    setActiveSuiteId(suiteId);
    setActiveBlockId(blockId);
  };

  const createNewBlock = () => {
    const blockId = `block-${Date.now()}`;
    const newBlock: TestBlock = { id: blockId, name: 'Untitled Test', steps: [] };
    setSuites(prev => prev.map(s => s.id !== activeSuiteId ? s : {
      ...s,
      tests: [...s.tests, newBlock],
    }));
    setActiveBlockId(blockId);
  };

  const renameSuite = (suiteId: string, name: string) => {
    setSuites(prev => prev.map(s => s.id === suiteId ? { ...s, name } : s));
  };

  const renameSuiteFileName = (suiteId: string, fileName: string) => {
    setSuites(prev => prev.map(s => s.id === suiteId ? { ...s, fileName } : s));
  };

  const renameBlock = (blockId: string, name: string) => {
    setSuites(prev => prev.map(s => s.id !== activeSuiteId ? s : {
      ...s,
      tests: s.tests.map(b => b.id === blockId ? { ...b, name } : b),
    }));
  };

  const deleteSuite = (suiteId: string) => {
    setSuites(prev => {
      const filtered = prev.filter(s => s.id !== suiteId);
      if (filtered.length === 0) {
        const blockId = `block-${Date.now()}`;
        const newSuiteId = `suite-${Date.now()}`;
        const newSuite: TestSuite = { id: newSuiteId, name: 'Untitled Suite', fileName: 'untitled-suite', beforeAll: [], beforeEach: [], afterEach: [], afterAll: [], tests: [{ id: blockId, name: 'Untitled Test', steps: [] }], devices: [] };
        if (activeSuiteId === suiteId) {
          setActiveSuiteId(newSuiteId);
          setActiveBlockId(blockId);
        }
        return [newSuite];
      }
      if (activeSuiteId === suiteId) {
        setActiveSuiteId(filtered[0].id);
        setActiveBlockId(filtered[0].tests[0]?.id || '');
      }
      return filtered;
    });
  };

  const deleteBlock = (blockId: string) => {
    setSuites(prev => prev.map(s => {
      if (s.id !== activeSuiteId) return s;
      const filtered = s.tests.filter(b => b.id !== blockId);
      if (filtered.length === 0) {
        const newBlockId = `block-${Date.now()}`;
        if (activeBlockId === blockId) setActiveBlockId(newBlockId);
        return { ...s, tests: [{ id: newBlockId, name: 'Untitled Test', steps: [] }] };
      }
      if (activeBlockId === blockId) setActiveBlockId(filtered[0].id);
      return { ...s, tests: filtered };
    }));
  };

  const refreshLibrary = async () => {
    const entries = await window.suziqai.listLibrary();
    setLibraryEntries(entries);
  };

  const setUpCi = async () => {
    try {
      const { path, secrets } = await window.suziqai.setUpCi();
      log(`CI workflow written to ${path}. Commit and push it to run your saved tests on push, pull requests and nightly.`
        + (secrets.length
          ? ` Add these repo secrets first (Settings → Secrets and variables → Actions): ${secrets.join(', ')}.`
          : ''));
    } catch (err) {
      // ipcRenderer.invoke wraps the main-process error message
      log(`CI setup failed: ${(err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`);
    }
  };

  const updateSuiteDevices = (suiteId: string, devices: import('@shared/types').DeviceConfig[]) => {
    setSuites(prev => prev.map(s => s.id === suiteId ? { ...s, devices } : s));
  };

  const savePlaywrightConfig = async () => {
    if (!projectPath) return;
    try {
      await window.suziqai.savePlaywrightConfig(playwrightConfig, projectPath);
      log(`Saved playwright.config.ts`);
    } catch (err) {
      log(`Config save failed: ${(err as Error).message}`);
    }
  };

  const saveTest = async () => {
    if (!currentSuite) return;
    try {
      const hasProjects = playwrightConfig.projects && playwrightConfig.projects.length > 0;
      const result = await window.suziqai.saveToLibrary(currentSuite, undefined, hasProjects);
      log(`Saved "${currentSuite.name}" → ${result.fileName}.spec.ts`);
    } catch (err) {
      log(`Save failed: ${(err as Error).message}`);
    }
  };

  const loadFromLibrary = async (fileName: string) => {
    try {
      const loaded = await window.suziqai.loadFromLibrary(fileName);
      const suite = migrateToSuite(loaded);
      // Keep the saved id: saving matches the file by it, so a new id would write <name>-2.spec.ts
      const suiteId = suite.id || `suite-${Date.now()}`;
      const open = suites.find((s) => s.id === suiteId);
      if (open && open.fileName === suite.fileName) {
        // Already open: switch to it rather than opening a second copy of the same file
        setActiveSuiteId(open.id);
        setActiveBlockId(open.tests[0]?.id || '');
        setSidebarMode('session');
        return;
      }
      // Another open suite happens to share the id (e.g. the default 'suite-1'): it gives way
      const reId = `suite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (open) setSuites(prev => prev.map(s => s.id === suiteId ? { ...s, id: reId } : s));
      const newSuite: TestSuite = { ...suite, id: suiteId };
      // Ensure block IDs are unique
      newSuite.tests = newSuite.tests.map((b, i) => ({ ...b, id: `block-${Date.now()}-${i}` }));
      setSuites(prev => [...prev, newSuite]);
      setActiveSuiteId(suiteId);
      setActiveBlockId(newSuite.tests[0]?.id || '');
      setSidebarMode('session');
      log(`Loaded "${suite.name}" from library`);
      if (loaded.importNotes?.length) {
        log(`Imported from a hand-written spec (read-only: saving is disabled). ${loaded.importNotes.length} line(s) couldn't become steps:`);
        loaded.importNotes.forEach((note: string) => log(`  ${note}`));
      }
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
      setSuites(prev => prev.map(s => {
        if (s.id !== activeSuiteId) return s;
        return {
          ...s,
          tests: s.tests.map(b => {
            if (b.id !== activeBlockId) return b;
            const newSteps = [...b.steps];
            if (insertAtIndex !== null && insertAtIndex <= newSteps.length) {
              newSteps.splice(insertAtIndex, 0, ...steps);
            } else {
              newSteps.push(...steps);
            }
            return { ...b, steps: newSteps };
          }),
        };
      }));
      setInsertAtIndex(null); // reset after insert
      log(`${(steps as any[]).length} step(s) added`);

      // Autopilot: auto-execute newly added steps (skip QA-suggested steps to prevent infinite loops)
      if (autopilotRef.current) {
        const executableSteps = (steps as any[]).filter((s: any) => !s._fromVisualQA);
        if (executableSteps.length > 0) {
          const stepsToRun = executableSteps.map((s: any) => ({ id: s.id, action: s.action, label: s.label }));
          log(`⚡ Autopilot: running ${stepsToRun.length} step(s)...`);
          window.suziqai.executeAllSteps(stepsToRun);
        }
      }
    });

    window.suziqai.onStepResult((stepId, status, error, screenshotPath) => {
      setSuites(prev => {
        const withResult = (steps: Step[]) => steps.map(st =>
          st.id === stepId ? { ...st, status: status as any, error, ...(screenshotPath ? { screenshotPath } : {}) } : st
        );
        // Hook steps run as part of a test (fresh run), so they get results too
        const updated = prev.map(s => s.id !== activeSuiteId ? s : {
          ...s,
          beforeAll: withResult(s.beforeAll),
          beforeEach: withResult(s.beforeEach),
          afterEach: withResult(s.afterEach),
          afterAll: withResult(s.afterAll),
          tests: s.tests.map(b => b.id !== activeBlockId ? b : { ...b, steps: withResult(b.steps) }),
        });
        // Log the result
        const suite = updated.find(s => s.id === activeSuiteId);
        const block = suite?.tests.find(b => b.id === activeBlockId);
        const hookSteps = suite ? [...suite.beforeAll, ...suite.beforeEach, ...suite.afterEach, ...suite.afterAll] : [];
        const step = block?.steps.find(s => s.id === stepId) ?? hookSteps.find(s => s.id === stepId);
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
            window.suziqai.setAutopilot(false);
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
  }, [activeSuiteId, activeBlockId]);

  // Report viewport bounds to main process so BrowserView can be positioned
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateBounds = () => {
      const rect = el.getBoundingClientRect();

      if (previewDevice !== 'default') {
        const deviceViewport = getDeviceViewport(previewDevice);
        if (deviceViewport) {
          const scale = Math.min(
            rect.width / deviceViewport.width,
            rect.height / deviceViewport.height,
            1
          );
          const w = Math.round(deviceViewport.width * scale);
          const h = Math.round(deviceViewport.height * scale);
          const x = rect.x + Math.round((rect.width - w) / 2);
          const y = rect.y + Math.round((rect.height - h) / 2);
          window.suziqai.setViewportBounds({ x, y, width: w, height: h });
          return;
        }
      }

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
  }, [projectPath, previewDevice]);

  // Load saved session when project opens
  useEffect(() => {
    if (!projectPath) return;
    window.suziqai.loadSession().then((data) => {
      if (data) {
        if (data.messages) setMessages(data.messages);
        if (data.suites) {
          // New format — still migrate to fill in any missing fields (e.g. fileName)
          const migrated = data.suites.map((s: any) => migrateToSuite(s));
          setSuites(migrated);
          setActiveSuiteId(data.activeSuiteId || data.suites[0]?.id || 'suite-1');
          setActiveBlockId(data.activeBlockId || data.suites[0]?.tests[0]?.id || 'block-1');
        } else if (data.tests) {
          // Old multi-test format — migrate each TestCase to a TestSuite
          const migrated: TestSuite[] = (data.tests as any[]).map((t: any) => migrateToSuite(t));
          setSuites(migrated);
          setActiveSuiteId(migrated[0]?.id || 'suite-1');
          setActiveBlockId(migrated[0]?.tests[0]?.id || 'block-1');
        } else if (data.currentTest) {
          // Oldest format — single test
          const migrated = migrateToSuite(data.currentTest);
          setSuites([migrated]);
          setActiveSuiteId(migrated.id);
          setActiveBlockId(migrated.tests[0]?.id || 'block-1');
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
        suites,
        activeSuiteId,
        activeBlockId,
      });
    }, 500); // debounce 500ms
    return () => clearTimeout(timeout);
  }, [messages, suites, activeSuiteId, activeBlockId, projectPath]);

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
    return <ProjectSetup onProjectOpened={(path, url, openedPlatform) => {
      setPlatform(openedPlatform ?? 'web');
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

  // The plan panel, viewport and chat are laid out differently for web and iOS (below)
  const planPanel = featurePlan && (
    <FeaturePlanPanel
      plan={featurePlan}
      statuses={featureStatuses}
      running={featureRunning}
      onRun={runFeaturePlan}
      onDiscard={() => { setFeaturePlan(null); setFeatureStatuses({}); }}
    />
  );
  // Browser viewport area — the BrowserView is positioned here by the main process; iOS draws the simulator screenshot
  const viewport = (
    <div
      ref={viewportRef}
      id="browser-viewport"
      style={{
        flex: platform === 'ios' ? '0 0 46%' : 1,
        background: 'var(--bg-dark)',
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        minHeight: 0,
      }}
    >
      {platform === 'ios' && iosScreen && (
        <div style={{ position: 'relative', height: '100%', padding: 8, boxSizing: 'border-box' }}>
          <img
            src={`data:image/png;base64,${iosScreen}`}
            alt="iOS simulator screen"
            style={{ height: '100%', display: 'block' }}
          />
          {tapMarker && tapMarker.screen[2] > 0 && (
            // Frames are in screen points; position as a fraction of the screen so it scales with the image
            <div style={{
              position: 'absolute',
              left: `calc(8px + (100% - 16px) * ${tapMarker.frame[0] / tapMarker.screen[2]})`,
              top: `calc(8px + (100% - 16px) * ${tapMarker.frame[1] / tapMarker.screen[3]})`,
              width: `calc((100% - 16px) * ${tapMarker.frame[2] / tapMarker.screen[2]})`,
              height: `calc((100% - 16px) * ${tapMarker.frame[3] / tapMarker.screen[3]})`,
              border: '3px solid #ff3b30', borderRadius: 8, boxShadow: '0 0 0 4px rgba(255,59,48,0.25)',
              pointerEvents: 'none',
            }}>
              <span style={{
                position: 'absolute', top: -22, left: 0, whiteSpace: 'nowrap',
                background: '#ff3b30', color: '#fff', fontSize: 11, padding: '2px 6px', borderRadius: 4,
              }}>{tapMarker.label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
  const chat = (
    <ChatPanel
      messages={messages}
      mode={mode}
      isLoading={isChatLoading}
      pickerResult={pickedSelectors ? { selectors: pickedSelectors, element: pickedElement } : null}
      onPickSelector={(selector, element) => {
        window.suziqai.copyToClipboard(selector);
        updateCurrentBlock(b => ({
          ...b,
          steps: [...b.steps, {
            id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            label: `Click '${element?.text?.substring(0, 30) || selector}'`,
            action: { type: 'click' as const, selector },
            status: 'pending' as const,
          }],
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
        if (mode === 'feature') {
          log(`🧭 Planning tests for "${content}"… (reading the project's code)`);
          window.suziqai.planFeature(content)
            .then((plan) => {
              setFeaturePlan(plan);
              setFeatureStatuses({});
              const sandbox = plan.scenarios.filter(s => s.runnable !== 'now').length;
              log(`📋 Plan ready: ${plan.scenarios.length} scenarios${sandbox ? ` (${sandbox} need a sandbox)` : ''} — review above, then Run`);
            })
            .catch((err: Error) => log(`Planning failed: ${err.message}`))
            .finally(() => setIsChatLoading(false));
        } else if (mode === 'goal') {
          setGoalRunning(true);
          // A goal runs like a test: fresh start, then the suite's setup hooks (e.g. login)
          const setup = currentSuite ? [...currentSuite.beforeAll, ...currentSuite.beforeEach].map(s => ({ id: s.id, label: s.label, action: s.action })) : [];
          window.suziqai.runGoal(content, setup).finally(() => { setGoalRunning(false); setIsChatLoading(false); });
        } else {
          window.suziqai.sendChat(content);
        }
      }}
    />
  );

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
          suites={suites}
          activeSuiteId={activeSuiteId}
          activeBlockId={activeBlockId}
          onSwitchSuite={(suiteId: string) => {
            setActiveSuiteId(suiteId);
            const suite = suites.find(s => s.id === suiteId);
            if (suite) setActiveBlockId(suite.tests[0]?.id || '');
            setPreviewDevice('default');
          }}
          onSwitchBlock={setActiveBlockId}
          onCreateSuite={createNewSuite}
          onCreateBlock={createNewBlock}
          onRenameSuite={renameSuite}
          onRenameSuiteFileName={renameSuiteFileName}
          onRenameBlock={renameBlock}
          onDeleteSuite={deleteSuite}
          onDeleteBlock={deleteBlock}
          onAddHookStep={(hookType: any, step: { label: string; action: any }) => {
            setIsDirty(true);
            updateCurrentSuite(s => ({
              ...s,
              [hookType]: [...(s[hookType as keyof typeof s] as any[] || []), {
                id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                label: step.label,
                action: step.action,
                status: 'pending' as const,
              }],
            }));
          }}
          onRemoveHookStep={(hookType: any, stepId: string) => {
            setIsDirty(true);
            updateCurrentSuite(s => ({
              ...s,
              [hookType]: ((s[hookType as keyof typeof s] as any[]) || []).filter((st: any) => st.id !== stepId),
            }));
          }}
          onAcceptStep={(stepId: string) => {
            if (!currentBlock) return;
            const stepIndex = currentBlock.steps.findIndex(s => s.id === stepId);
            const step = currentBlock.steps[stepIndex];
            if (!step) return;

            const isAction = step.action.type !== 'assert' && step.action.type !== 'waitFor';
            if (isAction) {
              // Run this action + all assertions nested under it
              const group = [step];
              for (let i = stepIndex + 1; i < currentBlock.steps.length; i++) {
                const next = currentBlock.steps[i];
                if (next.action.type === 'assert' || next.action.type === 'waitFor') {
                  group.push(next);
                } else {
                  break;
                }
              }
              log(`▶ Running: ${step.label} + ${group.length - 1} assertion(s)`);
              window.suziqai.executeAllSteps(group.map(s => ({ id: s.id, action: s.action, timeout: s.timeout, label: s.label })));
            } else {
              // Single assertion — just run it
              log(`▶ Running: ${step.label}`);
              window.suziqai.executeStep(stepId, step.action, step.timeout, step.label);
            }
          }}
          onDenyStep={(stepId: string) => {
            setIsDirty(true);
            updateCurrentBlock(b => ({
              ...b,
              steps: b.steps.filter(s => s.id !== stepId),
            }));
          }}
          onResetStep={(stepId: string) => {
            updateCurrentBlock(b => ({
              ...b,
              steps: b.steps.map(s =>
                s.id === stepId ? { ...s, status: 'pending' as const, error: undefined } : s
              ),
            }));
          }}
          onUpdateStep={(stepId: string, action: any, label: string, timeout?: number) => {
            setIsDirty(true);
            updateCurrentBlock(b => ({
              ...b,
              steps: b.steps.map(s =>
                s.id === stepId ? { ...s, action, label, timeout, status: 'pending' as const, error: undefined } : s
              ),
            }));
          }}
          onInsertStep={(index: number, step: { label: string; action: any }) => {
            setIsDirty(true);
            updateCurrentBlock(b => {
              const newSteps = [...b.steps];
              newSteps.splice(index, 0, {
                id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                label: step.label,
                action: step.action,
                status: 'pending' as const,
              });
              return { ...b, steps: newSteps };
            });
          }}
          onInsertPrompt={(index: number, prompt: string) => {
            setInsertAtIndex(index);
            setIsChatLoading(true);
            window.suziqai.sendChat(prompt);
          }}
          onRunActAndAssert={() => {
            if (!currentBlock) return;
            const actions = currentBlock.steps
              .filter(s => (s.status === 'pending' || s.status === 'passed') && s.action.type !== 'assert' && s.action.type !== 'waitFor');
            const assertions = currentBlock.steps
              .filter(s => (s.status === 'pending' || s.status === 'passed') && (s.action.type === 'assert' || s.action.type === 'waitFor'));
            const ordered = [...actions, ...assertions].map(s => ({ id: s.id, action: s.action, timeout: s.timeout, label: s.label }));
            log(`▶▶ Act & Assert: ${actions.length} action(s), then ${assertions.length} assertion(s)`);
            window.suziqai.executeAllSteps(ordered);
          }}
          onRunGroup={(stepIds: string[]) => {
            if (!currentBlock) return;
            const stepsToRun = currentBlock.steps
              .filter(s => stepIds.includes(s.id))
              .map(s => ({ id: s.id, action: s.action, timeout: s.timeout, label: s.label }));
            log(`▶▶ Act & Assert: running ${stepsToRun.length} step(s)`);
            window.suziqai.executeAllSteps(stepsToRun);
          }}
          onMoveStep={(stepIndex: number, direction: 'up' | 'down') => {
            setIsDirty(true);
            updateCurrentBlock(b => {
              const steps = [...b.steps];
              const swapIndex = direction === 'up' ? stepIndex - 1 : stepIndex + 1;
              if (swapIndex < 0 || swapIndex >= steps.length) return b;
              [steps[stepIndex], steps[swapIndex]] = [steps[swapIndex], steps[stepIndex]];
              return { ...b, steps };
            });
          }}
          onClearAssertions={(actionIndex: number, assertionCount: number) => {
            setIsDirty(true);
            updateCurrentBlock(b => {
              const steps = [...b.steps];
              steps.splice(actionIndex + 1, assertionCount);
              return { ...b, steps };
            });
          }}
          onRunAll={async () => {
            if (!currentBlock || !currentSuite) return;
            // Like CI: a fresh session (or relaunched app), then hooks around the test's steps
            const sequence = buildRunSequence(currentSuite, currentBlock)
              .map(s => ({ id: s.id, action: s.action, timeout: s.timeout, label: s.label }));
            const hooks = sequence.length - currentBlock.steps.length;
            log(`▶▶ Fresh run (like CI): ${currentBlock.steps.length} step(s)${hooks ? ` + ${hooks} hook step(s)` : ''}...`);
            await window.suziqai.runFresh();
            window.suziqai.executeAllSteps(sequence);
          }}
          onExport={() => {
            if (!currentSuite) return;
            window.suziqai.showSaveDialog(`${currentSuite.name}.spec.ts`).then(path => {
              if (path) window.suziqai.exportTest(currentSuite.id, path);
            });
          }}
          isDirty={isDirty}
          isAutopilot={isAutopilot}
          onAutopilotToggle={() => { const next = !isAutopilot; setIsAutopilot(next); window.suziqai.setAutopilot(next); }}
          sidebarMode={sidebarMode}
          onSidebarModeChange={setSidebarMode}
          onSaveTest={saveTest}
          libraryEntries={libraryEntries}
          onLoadFromLibrary={loadFromLibrary}
          onDeleteFromLibrary={deleteFromLibrary}
          onRefreshLibrary={refreshLibrary}
          onSetUpCi={setUpCi}
          onUpdateSuiteDevices={updateSuiteDevices}
          playwrightConfig={playwrightConfig}
          onPlaywrightConfigChange={setPlaywrightConfig}
          onSavePlaywrightConfig={savePlaywrightConfig}
          previewDevice={previewDevice}
          onPreviewDeviceChange={setPreviewDevice}
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top: Browser Toolbar + Viewport */}
        <BrowserToolbar
          url={platform === 'ios' ? 'iOS simulator' : currentUrl}
          mode={mode}
          isRecording={isRecording}
          isPicking={isPicking}
          onNavigate={(url: string) => window.suziqai.navigate(url)}
          onGoBack={() => window.suziqai.goBack()}
          onGoForward={() => window.suziqai.goForward()}
          onModeChange={(newMode: AppMode) => {
            setMode(newMode);
            window.suziqai.changeMode(newMode);
          }}
          onRecordToggle={() => {
            if (isRecording) {
              window.suziqai.stopRecording();
            } else {
              // Start at the current page only for an empty test; mid-test, a navigation step would reload it
              window.suziqai.startRecording((currentBlock?.steps.length ?? 0) === 0);
            }
            setIsRecording(!isRecording);
          }}
          onPickToggle={togglePicker}
        />
        {/* Replay speed + video import (web only) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 8px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => { const on = !watchMode; setWatchMode(on); window.suziqai.setWatchMode(on); }}
            title="Watch: replay slowly, highlighting each target before acting"
            style={{
              background: watchMode ? 'var(--accent-blue, #0969da)' : 'none',
              color: watchMode ? '#ffffff' : 'var(--text-secondary)',
              border: '1px solid var(--border)', borderRadius: 4,
              padding: '3px 8px', fontSize: 11, cursor: 'pointer', marginRight: 'auto',
            }}
          >
            {watchMode ? '👀 Watching' : '⚡ Fast'}
          </button>
          {goalRunning && (
            <button
              onClick={() => window.suziqai.stopGoal()}
              style={{ background: 'var(--accent-red)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', marginRight: 8 }}
            >
              ■ Stop goal
            </button>
          )}
          {platform === 'web' && <button
            onClick={() => setShowVideoImport(true)}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 4,
              padding: '3px 8px', fontSize: 11, color: 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ fontSize: 13 }}>🎬</span> Import from Video
          </button>}
        </div>
        {platform === 'ios' ? (
          /* iOS: the simulator is tall and narrow, so the plan and chat sit beside it */
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            {viewport}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, borderLeft: '1px solid var(--border)' }}>
              {planPanel}
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{chat}</div>
            </div>
          </div>
        ) : (
          <>
            {planPanel}
            {viewport}
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
            <div style={{ height: chatHeight }}>{chat}</div>
          </>
        )}
      </div>
      {showVideoImport && (
        <VideoImport onClose={() => setShowVideoImport(false)} />
      )}
    </div>
  );
}
