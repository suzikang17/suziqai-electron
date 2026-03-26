import { describe, it, expect, vi } from 'vitest';
import { Recorder, RecordedEvent } from '../../src/main/recorder';

describe('Recorder', () => {
  it('starts and stops recording, returning captured events', () => {
    const recorder = new Recorder();
    const callback = vi.fn();

    recorder.start(callback);

    recorder.pushEvent({ type: 'click', selector: 'button#submit', timestamp: 1000 });
    recorder.pushEvent({ type: 'fill', selector: 'input#email', value: 'test@test.com', timestamp: 1001 });

    expect(callback).toHaveBeenCalledTimes(2);

    const events = recorder.stop();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('click');
    expect(events[1].type).toBe('fill');
  });

  it('clears events on start', () => {
    const recorder = new Recorder();
    recorder.start(vi.fn());
    recorder.pushEvent({ type: 'click', selector: 'a', timestamp: 1 });
    recorder.stop();

    recorder.start(vi.fn());
    const events = recorder.stop();
    expect(events).toHaveLength(0);
  });
});
