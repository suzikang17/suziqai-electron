import { spawn } from 'child_process';
import { mkdir, readdir, readFile, rm, stat } from 'fs/promises';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { VideoStep } from '../shared/types';

const MAX_FRAMES = 300;
const MAX_DURATION_SECS = 300; // 5 minutes
const BATCH_SIZE = 20;
const BATCH_OVERLAP = 2;
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ACCEPTED_EXTENSIONS = ['.mp4', '.webm', '.mov'];

function getFfmpegPath(): string {
  try {
    // Try ffmpeg-static first (bundled binary)
    return require('ffmpeg-static');
  } catch {
    // Fall back to system ffmpeg
    return 'ffmpeg';
  }
}

const VIDEO_ANALYSIS_PROMPT = `You are analyzing a screen recording of a QA specialist manually testing a web application.
I will provide sequential screenshot frames, sampled about once a second with unchanged frames removed.

For each user action you detect between consecutive frames, output:
- label: human-readable description of the action
- actionType: "navigate" | "click" | "fill" | "press"
- elementHint: detailed visual description of the element acted upon
  (e.g., "purple button labeled 'Save' at bottom of a modal form",
   "text input field with placeholder 'Task Name' inside a card",
   "tab labeled 'Schedule' in the bottom navigation bar")
- url: the URL navigated to (navigate actions only, if visible in address bar)
- value: the text entered (fill actions only — infer from the final visible state of the input)
- key: the key pressed (press actions only), e.g. "Enter". Use a press action when typed text is
  submitted without clicking a button (the input clears or a new item appears)
- uncertain: true if you're not confident about this action

Do NOT output Playwright selectors — only describe what you see visually.
Ignore scrolling, hovering, window resizing, or passive state changes.
If a frame shows no change from the previous frame, skip it.

Output ONLY a valid JSON array of objects. No markdown fences, no explanation.`;

function runFfmpeg(args: string[]): Promise<string> {
  const ffmpeg = getFfmpegPath();
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
      else resolve(stderr); // ffmpeg outputs info to stderr
    });
    proc.on('error', () => {
      reject(new Error('ffmpeg not found. Install ffmpeg or run: npm install ffmpeg-static'));
    });
  });
}

function parseDuration(ffmpegOutput: string): number {
  const match = ffmpegOutput.match(/Duration:\s*(\d+):(\d+):(\d+)/);
  if (!match) return 0;
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
}

export async function validateVideo(videoPath: string): Promise<void> {
  const ext = '.' + videoPath.split('.').pop()?.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported format "${ext}". Use ${ACCEPTED_EXTENSIONS.join(', ')}`);
  }

  const fileStat = await stat(videoPath);
  if (fileStat.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${Math.round(fileStat.size / 1024 / 1024)}MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
  }

  // Check duration via ffmpeg probe
  const ffmpeg = getFfmpegPath();
  const info = await new Promise<string>((resolve, reject) => {
    const proc = spawn(ffmpeg, ['-i', videoPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', () => resolve(stderr)); // ffmpeg -i always exits non-zero without output
    proc.on('error', () => reject(new Error('ffmpeg not found')));
  });

  const duration = parseDuration(info);
  if (duration > MAX_DURATION_SECS) {
    throw new Error(`Video too long (${Math.round(duration / 60)}min). Maximum is ${MAX_DURATION_SECS / 60} minutes.`);
  }
}

export async function extractFrames(
  videoPath: string,
  outputDir?: string
): Promise<{ frames: string[]; tmpDir: string }> {
  const dir = outputDir ?? join(tmpdir(), `suziqai-frames-${randomUUID()}`);
  await mkdir(dir, { recursive: true });

  // 1fps, drop frames that barely differ from the last kept one (mpdecimate),
  // and downscale: the model gains nothing from >1280px and payloads stay small
  await runFfmpeg([
    '-i', videoPath,
    '-vf', "fps=1,mpdecimate,scale='min(1280,iw)':-2",
    '-fps_mode', 'vfr',
    '-q:v', '3',
    join(dir, 'frame_%04d.jpg'),
    '-y',
  ]);

  const fpsFrames = (await readdir(dir))
    .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort()
    .map(f => join(dir, f));

  // Cap at MAX_FRAMES — sample evenly if exceeded
  let frames = fpsFrames;
  if (frames.length > MAX_FRAMES) {
    const step = frames.length / MAX_FRAMES;
    frames = Array.from({ length: MAX_FRAMES }, (_, i) => fpsFrames[Math.floor(i * step)]);
  }

  return { frames, tmpDir: dir };
}

export function batchFrames(framePaths: string[]): string[][] {
  if (framePaths.length <= BATCH_SIZE) return [framePaths];

  const batches: string[][] = [];
  let start = 0;

  while (start < framePaths.length) {
    const end = Math.min(start + BATCH_SIZE, framePaths.length);
    batches.push(framePaths.slice(start, end));
    const next = end - BATCH_OVERLAP;
    // Ensure we always advance to avoid infinite loop
    start = next > start ? next : end;
  }

  return batches;
}

type FrameContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } };

/** All frames as labelled image blocks plus the prompt — one request instead of a Read per frame. */
export async function buildFrameContent(framePaths: string[], prompt: string): Promise<FrameContent[]> {
  const content: FrameContent[] = [];
  for (let i = 0; i < framePaths.length; i++) {
    content.push({ type: 'text', text: `Frame ${i + 1}:` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: (await readFile(framePaths[i])).toString('base64') },
    });
  }
  content.push({ type: 'text', text: prompt });
  return content;
}

async function queryWithFrames(content: FrameContent[]): Promise<string> {
  let result = '';
  for await (const message of query({
    prompt: (async function* () {
      yield {
        type: 'user' as const,
        message: { role: 'user' as const, content },
        parent_tool_use_id: null,
        session_id: '',
      };
    })(),
    options: { model: 'sonnet', maxTurns: 1, allowedTools: [] },
  })) {
    if (message.type === 'result') {
      if (message.subtype !== 'success') throw new Error(`Frame analysis failed: ${message.subtype}`);
      result = message.result;
    }
  }
  return result;
}

export async function analyzeFrameBatch(
  framePaths: string[],
  batchIndex: number,
  totalBatches: number
): Promise<VideoStep[]> {
  const batchContext = totalBatches > 1
    ? `\n\nThis is batch ${batchIndex + 1} of ${totalBatches}. ${batchIndex > 0 ? 'The first 2 frames overlap with the previous batch for continuity — do not re-report actions from those frames unless they span the boundary.' : ''}`
    : '';

  const prompt = `${VIDEO_ANALYSIS_PROMPT}${batchContext}

The frames above are in order. Analyze them.`;

  const raw = await queryWithFrames(await buildFrameContent(framePaths, prompt));

  // Extract JSON from response (strip markdown fences if present)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn(`[video-analyzer] batch ${batchIndex + 1}: no JSON array in response: ${raw.slice(0, 300)}`);
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((s: any) =>
        s.label &&
        ['navigate', 'click', 'fill', 'press'].includes(s.actionType)
      )
      .map((s: any): VideoStep => ({
        label: s.label,
        actionType: s.actionType,
        elementHint: s.elementHint,
        url: s.url,
        value: s.value,
        key: s.key,
        uncertain: s.uncertain ?? false,
        frameIndex: s.frameIndex,
      }));
  } catch (err) {
    console.warn(`[video-analyzer] batch ${batchIndex + 1}: unparseable JSON (${(err as Error).message}): ${jsonMatch[0].slice(0, 300)}`);
    return [];
  }
}

export function mergeVideoSteps(batchResults: VideoStep[][]): VideoStep[] {
  const all = batchResults.flat();

  // Deduplicate consecutive identical actions
  return all.filter((step, i) => {
    if (i === 0) return true;
    const prev = all[i - 1];
    return !(
      step.actionType === prev.actionType &&
      step.label === prev.label &&
      step.elementHint === prev.elementHint
    );
  });
}

export async function cleanupFrames(tmpDir: string): Promise<void> {
  try {
    await rm(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}
