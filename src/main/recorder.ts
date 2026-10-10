import type { WebContents } from 'electron';
import type { StepAction } from '../shared/types';
import { DESCRIBE_ELEMENT_FN } from './element-picker';

// Records clicks, typed values and Enter in the target-app BrowserView as suziQai steps.
// The in-page script reports over console messages (they survive the page unloading when a
// click navigates); the main process picks a selector for each event against the live page.

export const RECORD_PREFIX = '__suziqai_rec__';

export interface CapturedEvent {
  kind: 'click' | 'fill' | 'press';
  info: Record<string, unknown> & { tag: string };
  value?: string;
  key?: string;
  /** Password fields: the value is never captured. */
  masked?: boolean;
  /** The element is tagged data-suziqai-rec=<recId> so an ambiguous selector can be pinned with .nth(). */
  recId?: string;
}

export const RECORDER_SCRIPT = `
(function() {
  if (window.__suziqaiRecorder) return;
  window.__suziqaiRecorder = true;
  ${DESCRIBE_ELEMENT_FN}

  var TEXT_TYPES = /^(|text|email|password|search|tel|url|number|date|time|datetime-local|month|week)$/;
  function isTextField(el) {
    if (!el || !el.tagName) return false;
    if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
    return el.tagName === 'INPUT' && TEXT_TYPES.test((el.getAttribute('type') || '').toLowerCase());
  }
  function actionable(el) {
    return (el.closest && el.closest('button,a,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=option],[role=radio],[role=combobox],input,select,textarea,label,summary')) || el;
  }
  var nextId = 0;
  function tag(el) {
    if (!el.getAttribute('data-suziqai-rec')) el.setAttribute('data-suziqai-rec', String(++nextId) + '-' + Date.now());
    return el.getAttribute('data-suziqai-rec');
  }
  function send(ev, el) { ev.recId = tag(el); console.debug('${RECORD_PREFIX}' + JSON.stringify(ev)); }
  function fieldValue(el) { return el.isContentEditable ? el.textContent : el.value; }
  function flushFill(el) {
    var value = fieldValue(el);
    if (el.__suziqaiRecorded === value) return;
    el.__suziqaiRecorded = value;
    var masked = (el.getAttribute('type') || '').toLowerCase() === 'password';
    send({ kind: 'fill', info: __suziqaiDescribe(el), value: masked ? '' : value, masked: masked || undefined }, el);
  }

  document.addEventListener('click', function(e) {
    var el = actionable(e.target);
    if (isTextField(el)) return; // focusing a field; its value is recorded on change/Enter
    send({ kind: 'click', info: __suziqaiDescribe(el) }, el);
  }, true);
  document.addEventListener('change', function(e) {
    if (isTextField(e.target)) flushFill(e.target);
  }, true);
  document.addEventListener('keydown', function(e) {
    var el = e.target;
    if (e.key !== 'Enter' || !isTextField(el) || el.tagName === 'TEXTAREA') return;
    flushFill(el);
    send({ kind: 'press', info: __suziqaiDescribe(el), key: 'Enter' }, el);
  }, true);
})();
true;
`;

export function eventToStep(ev: CapturedEvent, selector: string): { label: string; action: StepAction } {
  switch (ev.kind) {
    case 'click':
      return { label: `Click ${selector}`, action: { type: 'click', selector } };
    case 'press':
      return { label: `Press ${ev.key} on ${selector}`, action: { type: 'press', selector, key: ev.key ?? 'Enter' } };
    case 'fill':
      return ev.masked
        ? { label: `Fill ${selector} [needs value]`, action: { type: 'fill', selector, value: '{{password}}' } }
        : { label: `Fill ${selector}`, action: { type: 'fill', selector, value: ev.value ?? '' } };
  }
}

export interface RecorderHooks {
  /** Picks the selector for a captured element (e.g. the first candidate unique on the live page). */
  chooseSelector: (info: CapturedEvent['info'], recId?: string) => Promise<string>;
  onStep: (step: { label: string; action: StepAction }) => void;
}

export class Recorder {
  private contents: WebContents | null = null;
  private lastClickAt = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = {
    console: (...args: unknown[]) => this.onConsole(args),
    load: () => void this.inject(),
    navigate: (_e: unknown, url: string) => this.onNavigate(url),
  };

  constructor(private readonly hooks: RecorderHooks) {}

  get isRecording(): boolean {
    return this.contents !== null;
  }

  /** includeNavigate: begin with a step that opens the current page (for an empty test). */
  async start(contents: WebContents, includeNavigate = true): Promise<void> {
    this.stop();
    this.contents = contents;
    contents.on('console-message', this.listeners.console);
    contents.on('did-finish-load', this.listeners.load);
    contents.on('did-navigate', this.listeners.navigate);
    if (includeNavigate) {
      this.hooks.onStep({ label: `Go to ${contents.getURL()}`, action: { type: 'navigate', url: contents.getURL() } });
    }
    await this.inject();
  }

  stop(): void {
    if (!this.contents) return;
    this.contents.off('console-message', this.listeners.console);
    this.contents.off('did-finish-load', this.listeners.load);
    this.contents.off('did-navigate', this.listeners.navigate);
    this.contents = null;
  }

  private async inject(): Promise<void> {
    await this.contents?.executeJavaScript(RECORDER_SCRIPT).catch(() => undefined);
  }

  private onConsole(args: unknown[]): void {
    // Electron passes (event, level, message, …) in older versions and (details) in newer ones
    const message = args.find((a): a is string => typeof a === 'string' && a.startsWith(RECORD_PREFIX))
      ?? (args[0] as { message?: string } | undefined)?.message;
    if (typeof message !== 'string' || !message.startsWith(RECORD_PREFIX)) return;
    const ev = JSON.parse(message.slice(RECORD_PREFIX.length)) as CapturedEvent;
    if (ev.kind === 'click') this.lastClickAt = Date.now();
    // Keep steps in capture order even though selector checks are async
    this.queue = this.queue.then(async () => {
      const selector = await this.hooks.chooseSelector(ev.info, ev.recId);
      this.hooks.onStep(eventToStep(ev, selector));
    }).catch(() => undefined);
  }

  private onNavigate(url: string): void {
    // A navigation right after a click is that click's effect, not a separate step
    if (Date.now() - this.lastClickAt < 2000) return;
    this.hooks.onStep({ label: `Go to ${url}`, action: { type: 'navigate', url } });
  }
}
