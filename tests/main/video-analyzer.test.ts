import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { batchFrames, mergeVideoSteps, extractFrames, buildFrameContent } from '../../src/main/video-analyzer';
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

describe('extractFrames', () => {
  it('drops near-duplicate frames and writes downscaled JPEGs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'va-test-'));
    const video = join(dir, 'in.mp4');
    // 6s of a static white screen, then 4s of a changing test pattern
    execFileSync(require('ffmpeg-static'), [
      '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=white:s=1920x1080:d=6:r=10',
      '-f', 'lavfi', '-i', 'testsrc=s=1920x1080:d=4:r=10',
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', video,
    ]);

    const { frames, tmpDir } = await extractFrames(video, join(dir, 'frames'));

    expect(frames.length).toBeGreaterThanOrEqual(4);
    expect(frames.length).toBeLessThan(8); // 10 at 1fps without dedupe
    expect(frames.every((f) => f.endsWith('.jpg'))).toBe(true);
    // ffmpeg -i with no output exits non-zero and prints stream info to stderr
    let info = '';
    try {
      execFileSync(require('ffmpeg-static'), ['-i', frames[0]], { stdio: 'pipe' });
    } catch (err) {
      info = String((err as { stderr: Buffer }).stderr);
    }
    expect(info).toMatch(/1280x720/);
    await rm(tmpDir, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }, 30000);
});

describe('buildFrameContent', () => {
  it('sends every frame as a base64 JPEG image block, in order, followed by the prompt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'va-test-'));
    const a = join(dir, 'a.jpg');
    const b = join(dir, 'b.jpg');
    await writeFile(a, Buffer.from('frame-a'));
    await writeFile(b, Buffer.from('frame-b'));

    const content = await buildFrameContent([a, b], 'analyze these');

    expect(content.map((c) => c.type)).toEqual(['text', 'image', 'text', 'image', 'text']);
    expect(content[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from('frame-a').toString('base64') },
    });
    expect(content[0]).toEqual({ type: 'text', text: 'Frame 1:' });
    expect(content[4]).toEqual({ type: 'text', text: 'analyze these' });
    await rm(dir, { recursive: true, force: true });
  });
});
