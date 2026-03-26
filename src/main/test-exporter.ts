import { claudeCode } from '@anthropic-ai/claude-code';
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

    const response = await claudeCode({
      prompt,
      options: { maxTokens: 4096 },
    });

    const code = typeof response === 'string'
      ? response
      : Array.isArray(response.content)
        ? response.content.find((c: any) => c.type === 'text')?.text ?? ''
        : '';

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
