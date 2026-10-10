import { describe, it, expect } from 'vitest';
import { batchFrames, mergeVideoSteps } from '../../src/main/video-analyzer';
import type { VideoStep } from '../../src/shared/types';

describe('batchFrames', () => {
  it('returns single batch for small frame sets', () => {
    const frames = Array.from({ length: 10 }, (_, i) => `/tmp/frame_${i}.png`);
    const batches = batchFrames(frames);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(10);
  });

  it('returns single batch when exactly at batch size', () => {
    const frames = Array.from({ length: 20 }, (_, i) => `/tmp/frame_${i}.png`);
    const batches = batchFrames(frames);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(20);
  });

  it('splits into overlapping batches for larger sets', () => {
    const frames = Array.from({ length: 50 }, (_, i) => `/tmp/frame_${i}.png`);
    const batches = batchFrames(frames);
    expect(batches.length).toBeGreaterThan(1);

    // Each batch should be <= 20 frames
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(20);
    }

    // Batches should overlap by 2 frames
    for (let i = 1; i < batches.length; i++) {
      const prevEnd = batches[i - 1].slice(-2);
      const currStart = batches[i].slice(0, 2);
      expect(currStart).toEqual(prevEnd);
    }

    // All frames should be covered
    const allFrames = new Set(batches.flat());
    expect(allFrames.size).toBe(50);
  });

  it('handles single frame', () => {
    const batches = batchFrames(['/tmp/frame_0.png']);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });

  it('handles empty array', () => {
    const batches = batchFrames([]);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(0);
  });
});

describe('mergeVideoSteps', () => {
  const step = (label: string, actionType: VideoStep['actionType'], hint?: string): VideoStep => ({
    label,
    actionType,
    elementHint: hint,
  });

  it('flattens multiple batch results', () => {
    const batches = [
      [step('Click Submit', 'click', 'submit button')],
      [step('Navigate to /home', 'navigate')],
    ];
    const result = mergeVideoSteps(batches);
    expect(result).toHaveLength(2);
  });

  it('deduplicates consecutive identical actions', () => {
    const batches = [
      [
        step('Click Submit', 'click', 'submit button'),
        step('Click Submit', 'click', 'submit button'),
      ],
    ];
    const result = mergeVideoSteps(batches);
    expect(result).toHaveLength(1);
  });

  it('keeps non-consecutive duplicates', () => {
    const batches = [
      [
        step('Click Submit', 'click', 'submit button'),
        step('Fill email', 'fill', 'email input'),
        step('Click Submit', 'click', 'submit button'),
      ],
    ];
    const result = mergeVideoSteps(batches);
    expect(result).toHaveLength(3);
  });

  it('deduplicates across batch boundaries (overlap)', () => {
    const batches = [
      [step('Click A', 'click', 'a'), step('Click B', 'click', 'b')],
      [step('Click B', 'click', 'b'), step('Click C', 'click', 'c')],
    ];
    const result = mergeVideoSteps(batches);
    expect(result).toHaveLength(3);
    expect(result.map(s => s.label)).toEqual(['Click A', 'Click B', 'Click C']);
  });

  it('handles empty batches', () => {
    expect(mergeVideoSteps([])).toHaveLength(0);
    expect(mergeVideoSteps([[]])).toHaveLength(0);
  });
});
