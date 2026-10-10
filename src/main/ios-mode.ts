import { execFile } from 'child_process';
import { readdir, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type { BrowserWindow } from 'electron';
import type { IosProjectSettings, StepAction } from '../shared/types';
import type { JevClient } from './jev-decider';
import { IosDriver } from './ios-driver';
import { IosSession } from './ios-session';

// iOS projects: the simulator replaces the BrowserView. Screens are pushed to the renderer as
// screenshots after each action, and steps run through IosSession (Jev resolves elements).

const exec = promisify(execFile);

export const IOS_SCREENSHOT = 'ios:screenshot';
export const STEP_RESOLVED = 'step:resolved';
export const IOS_TAP_MARKER = 'ios:tap-marker';

interface SimDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
}

/**
 * The simulator to use: the project's saved one, else the iPhone where the app was installed most
 * recently (`withApp` is ordered newest install first — the build last run from Xcode; an older
 * booted simulator may hold a stale build), else any booted iPhone, else the newest iPhone.
 */
export function chooseSimulator(devices: SimDevice[], opts: { saved?: string; withApp: string[] }): string {
  const iphones = devices.filter((d) => d.isAvailable && d.name.startsWith('iPhone'));
  const chosen =
    iphones.find((d) => d.udid === opts.saved) ??
    opts.withApp.map((udid) => iphones.find((d) => d.udid === udid)).find(Boolean) ??
    iphones.find((d) => d.state === 'Booted') ??
    iphones[iphones.length - 1];
  if (!chosen) throw new Error('No iPhone simulator available — install one in Xcode');
  return chosen.udid;
}

async function isInstalled(udid: string, bundleId: string): Promise<boolean> {
  return exec('xcrun', ['simctl', 'get_app_container', udid, bundleId]).then(() => true, () => false);
}

/**
 * When the app was installed on this simulator (ms since epoch), or 0 if it isn't. Works on
 * shut-down simulators too (simctl can only query booted ones) by reading installed Info.plists.
 */
async function installedAt(udid: string, bundleId: string): Promise<number> {
  const appsDir = path.join(os.homedir(), 'Library/Developer/CoreSimulator/Devices', udid, 'data/Containers/Bundle/Application');
  for (const container of await readdir(appsDir).catch(() => [] as string[])) {
    const app = (await readdir(path.join(appsDir, container)).catch(() => [] as string[])).find((f) => f.endsWith('.app'));
    if (!app) continue;
    const plist = path.join(appsDir, container, app, 'Info.plist');
    const { stdout } = await exec('plutil', ['-extract', 'CFBundleIdentifier', 'raw', plist]).catch(() => ({ stdout: '' }));
    if (stdout.trim() === bundleId) return (await stat(path.join(appsDir, container, app))).mtimeMs;
  }
  return 0;
}

async function pickSimulator(bundleId: string, saved?: string): Promise<string> {
  const { stdout } = await exec('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
  const devices = Object.entries(JSON.parse(stdout).devices as Record<string, SimDevice[]>)
    .filter(([runtime]) => runtime.includes('iOS'))
    .flatMap(([, list]) => list);
  const iphones = devices.filter((d) => d.isAvailable && d.name.startsWith('iPhone'));
  const installs = await Promise.all(iphones.map(async (d) => ({ udid: d.udid, at: await installedAt(d.udid, bundleId) })));
  const withApp = installs.filter((i) => i.at > 0).sort((a, b) => b.at - a.at).map((i) => i.udid);
  return chooseSimulator(devices, { saved, withApp });
}

async function findXctestrun(appRoot: string): Promise<string> {
  const dir = path.join(appRoot, 'ios-runner', 'build', 'Build', 'Products');
  const file = (await readdir(dir).catch(() => [])).find((f) => f.endsWith('.xctestrun'));
  if (!file) throw new Error('iOS runner not built — run `npm run ios-runner:build`');
  return path.join(dir, file);
}

export class IosMode {
  private driver: IosDriver | null = null;
  private session: IosSession | null = null;
  private settings: IosProjectSettings | null = null;

  constructor(
    private readonly appRoot: string,
    private readonly getWindow: () => BrowserWindow | null,
    private readonly jev: JevClient | null,
  ) {}

  /** Watch mode: show each tap target on the screenshot and pause before acting. */
  setWatch(watch: boolean): void {
    this.watch = watch;
    if (this.session) this.session.beforeAct = watch ? this.showTarget : null;
  }
  private watch = false;
  private readonly showTarget = async (element: { frame: [number, number, number, number] }, screen: [number, number, number, number], label: string) => {
    await this.pushScreenshot().catch(() => undefined);
    this.getWindow()?.webContents.send(IOS_TAP_MARKER, { frame: element.frame, screen, label });
    await new Promise((r) => setTimeout(r, 800));
  };

  get active(): boolean {
    return this.session !== null;
  }

  get bundleId(): string {
    return this.settings?.bundleId ?? '';
  }

  async open(settings: IosProjectSettings): Promise<string> {
    await this.close();
    const udid = await pickSimulator(settings.bundleId, settings.udid);
    await exec('xcrun', ['simctl', 'boot', udid]).catch(() => undefined); // already booted is fine
    if (!(await isInstalled(udid, settings.bundleId))) {
      throw new Error(`${settings.bundleId} isn't installed on simulator ${udid} — build and run it there from Xcode first`);
    }
    this.driver = new IosDriver({ udid, xctestrun: await findXctestrun(this.appRoot) });
    await this.driver.start();
    this.session = new IosSession(this.driver, this.jev, settings);
    this.session.beforeAct = this.watch ? this.showTarget : null;
    this.settings = { ...settings, udid };
    await this.session.launch();
    await this.pushScreenshot();
    return udid;
  }

  /** Relaunches the app under test (a fresh start, like each XCUITest's setUp). */
  async relaunch(): Promise<void> {
    await this.session?.launch();
    await this.pushScreenshot().catch(() => undefined);
  }

  async close(): Promise<void> {
    await this.driver?.stop();
    this.driver = null;
    this.session = null;
    this.settings = null;
  }

  async pushScreenshot(): Promise<void> {
    if (!this.driver) return;
    const png = await this.driver.screenshot();
    this.getWindow()?.webContents.send(IOS_SCREENSHOT, png.toString('base64'));
  }

  /** PageContext for Claude: the screen as text plus a screenshot. */
  async chatContext() {
    if (!this.driver || !this.session) throw new Error('iOS session not open');
    return {
      url: `ios://${this.bundleId}`,
      accessibilityTree: await this.session.describeScreen(),
      screenshot: await this.driver.screenshot(),
    };
  }

  /** Runs one step and reports status (and any newly resolved selector) to the renderer. */
  /** Runs one step and returns the outcome (no renderer messages). */
  async tryStep(label: string, action: StepAction, timeout?: number): Promise<{ ok: boolean; error?: string; resolvedSelector?: string }> {
    if (!this.session) return { ok: false, error: 'iOS session not open' };
    try {
      const { resolvedSelector } = await this.session.execute(label, action, timeout);
      await new Promise((r) => setTimeout(r, 300)); // let the UI settle before the screenshot
      return { ok: true, resolvedSelector };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    } finally {
      await this.pushScreenshot().catch(() => undefined);
    }
  }

  async executeStep(stepId: string, label: string, action: StepAction, timeout?: number): Promise<boolean> {
    const win = this.getWindow();
    if (!this.session || !win) return false;
    win.webContents.send('step:result', stepId, 'running');
    const result = await this.tryStep(label, action, timeout);
    if (result.resolvedSelector) win.webContents.send(STEP_RESOLVED, stepId, result.resolvedSelector);
    win.webContents.send('step:result', stepId, result.ok ? 'passed' : 'failed', result.error);
    return result.ok;
  }
}

/** Added to chat messages in iOS projects, so Claude plans device steps rather than web locators. */
export const IOS_CHAT_PREFIX = `[This project is an iOS app on a simulator, not a web page. Plan steps with click, fill, press (key "Enter"), swipe (direction up/down/left/right; with a selector to swipe on that element, e.g. left on a list row to reveal Delete; without one to scroll), assert (visible/hidden/text/value/enabled/disabled/checked/unchecked) and waitFor. For click/fill/press/swipe steps, set "selector" to a short description of the element using its label from the element list (e.g. "Schedule tab", "Name field") — suziQai resolves it on the device. For waitFor and assert steps, set "selector" to text that is visible on the target screen (e.g. "Care Team"), not a description like "Care Team screen". Do not use navigate or Playwright locators.]`;
