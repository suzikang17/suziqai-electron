import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import type { Step } from '../shared/types';

const EXPORT_PROMPT = `You are a Playwright test code generator. Given a list of test steps, generate a complete, idiomatic Playwright test file.

Rules:
- Use import { test, expect } from '@playwright/test'
- Use test.describe for grouping
- Use test.beforeEach for shared setup if there are multiple tests
- Use Playwright's recommended locator strategy: getByRole > getByLabel > getByText > getByTestId > CSS
- Generate meaningful test names from the step intent
- Output ONLY the TypeScript code, no markdown fences, no explanation`;

function invokeClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '--print', prompt,
      '--output-format', 'text',
      '--max-turns', '1',
    ];

    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude CLI: ${err.message}. Is Claude Code installed?`));
    });
  });
}

export class TestExporter {
  async exportSteps(testName: string, steps: Step[], outputPath: string): Promise<string> {
    const stepsDescription = steps.map((s, i) => {
      const action = s.action;
      return `${i + 1}. ${s.label} — ${JSON.stringify(action)}`;
    }).join('\n');

    const prompt = `${EXPORT_PROMPT}

Test name: "${testName}"

Steps:
${stepsDescription}

Generate the Playwright test file:`;

    const code = await invokeClaudeCli(prompt);

    // Strip markdown code fences if present
    const cleanCode = code.replace(/^```\w*\n/, '').replace(/\n```$/, '').trim();

    await writeFile(outputPath, cleanCode, 'utf-8');
    return outputPath;
  }

  async export(testId: string, outputPath: string): Promise<string> {
    // This method is called from IPC — it will look up the test by ID from a store
    // For now, this is a placeholder that will be wired up when we add test state management
    return outputPath;
  }
}
