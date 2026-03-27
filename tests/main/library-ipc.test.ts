// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockHandle } = vi.hoisted(() => ({ mockHandle: vi.fn() }));

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
  BrowserWindow: vi.fn(),
}));

import { registerIpcHandlers } from '../../src/main/ipc-handlers';

function makeDeps(overrides: Record<string, any> = {}) {
  return {
    browserManager: {
      navigate: vi.fn(),
      getCurrentUrl: vi.fn().mockReturnValue('http://localhost'),
      getAccessibilityTree: vi.fn().mockResolvedValue(''),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      executeAction: vi.fn(),
    },
    claudeSession: {
      send: vi.fn().mockResolvedValue({ message: '', steps: [] }),
      processRecording: vi.fn().mockResolvedValue({ message: '', steps: [] }),
      requestVisualQA: vi.fn().mockResolvedValue({ message: '', steps: [] }),
      addSnapshot: vi.fn(),
    },
    recorder: {
      start: vi.fn(),
      stop: vi.fn().mockReturnValue([]),
    },
    observer: {
      start: vi.fn(),
      stop: vi.fn(),
    },
    testExporter: {
      export: vi.fn().mockResolvedValue('/tmp/out.spec.ts'),
    },
    _testLibrary: {
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue({ fileName: 'test', path: '/tmp/test.spec.ts' }),
      load: vi.fn().mockResolvedValue({ id: 'test-1', name: 'Test', steps: [] }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    get getTestLibrary() {
      return () => this._testLibrary;
    },
    getWindow: vi.fn().mockReturnValue(null),
    ...overrides,
  };
}

describe('library IPC handlers', () => {
  beforeEach(() => {
    mockHandle.mockReset();
  });

  it('registers all four library handlers', () => {
    const deps = makeDeps();
    registerIpcHandlers(deps as any);

    const registeredChannels = mockHandle.mock.calls.map((call) => call[0]);
    expect(registeredChannels).toContain('library:list');
    expect(registeredChannels).toContain('library:save');
    expect(registeredChannels).toContain('library:load');
    expect(registeredChannels).toContain('library:delete');
  });

  it('library:list handler calls testLibrary.list()', async () => {
    const deps = makeDeps();
    registerIpcHandlers(deps as any);

    const listCall = mockHandle.mock.calls.find((call) => call[0] === 'library:list');
    expect(listCall).toBeDefined();

    const handler = listCall![1];
    await handler();

    expect(deps._testLibrary.list).toHaveBeenCalledOnce();
  });

  it('library:save handler calls testLibrary.save() with test and fileName', async () => {
    const deps = makeDeps();
    registerIpcHandlers(deps as any);

    const saveCall = mockHandle.mock.calls.find((call) => call[0] === 'library:save');
    expect(saveCall).toBeDefined();

    const handler = saveCall![1];
    const mockTest = { id: 'test-1', name: 'My Test', steps: [] };
    await handler({} /* _event */, mockTest, 'my-test');

    expect(deps._testLibrary.save).toHaveBeenCalledWith(mockTest, 'my-test');
  });

  it('library:load handler calls testLibrary.load() with fileName', async () => {
    const deps = makeDeps();
    registerIpcHandlers(deps as any);

    const loadCall = mockHandle.mock.calls.find((call) => call[0] === 'library:load');
    expect(loadCall).toBeDefined();

    const handler = loadCall![1];
    await handler({} /* _event */, 'my-test');

    expect(deps._testLibrary.load).toHaveBeenCalledWith('my-test');
  });

  it('library:delete handler calls testLibrary.delete() with fileName', async () => {
    const deps = makeDeps();
    registerIpcHandlers(deps as any);

    const deleteCall = mockHandle.mock.calls.find((call) => call[0] === 'library:delete');
    expect(deleteCall).toBeDefined();

    const handler = deleteCall![1];
    await handler({} /* _event */, 'my-test');

    expect(deps._testLibrary.delete).toHaveBeenCalledWith('my-test');
  });
});
