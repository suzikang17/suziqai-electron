// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import {
  CI_MARKER,
  collectEnvSecrets,
  generateCiWorkflow,
  isSuziqaiWorkflow,
} from '../../src/shared/utils/generateCiWorkflow';
import type { ProjectConfig, Step, TestSuite } from '../../src/shared/types';

const step = (id: string, action: Step['action']): Step => ({ id, label: id, action, status: 'passed' });

const suite = (name: string, steps: Step[], beforeEach: Step[] = []): TestSuite => ({
  id: name, name, fileName: name.toLowerCase(), beforeAll: [], beforeEach, afterEach: [], afterAll: [],
  tests: [{ id: 'b1', name: 'works', steps }], devices: [],
});

const webConfig: ProjectConfig = {
  platform: 'web', baseUrl: 'https://shop.example.com', browser: 'chromium', testOutputDir: 'e2e', locatorStrategy: 'recommended',
};
const iosConfig: ProjectConfig = {
  platform: 'ios', ios: { bundleId: 'pet.homepage.PetHomepage', launchArgs: ['-uiTesting'] },
  baseUrl: '', browser: 'chromium', testOutputDir: 'PetHomepageUITests', locatorStrategy: 'recommended',
};

const login = suite('Login flow', [
  step('s1', { type: 'fill', selector: "getByLabel('Email')", value: '{{env.TEST_EMAIL}}' }),
  step('s2', { type: 'fill', selector: "getByLabel('Password')", value: 'pw-{{env.TEST_PASSWORD}}!' }),
], [step('s0', { type: 'navigate', url: '{{env.APP_HOST}}/login?token={{env.TEST_EMAIL}}' })]);

/**
 * No YAML parser in the dependency tree: check what breaks workflows in practice — tabs, odd
 * indentation, block scalars that don't nest under their key, and unbalanced expressions.
 */
function checkYamlStructure(yaml: string): string[] {
  const problems: string[] = [];
  let blockIndent = -1; // >= 0 while inside a `key: |` block scalar
  yaml.split('\n').forEach((line, i) => {
    const n = i + 1;
    if (line.includes('\t')) problems.push(`${n}: tab`);
    if (!line.trim()) return;
    const ind = line.length - line.trimStart().length;
    if (blockIndent >= 0) {
      if (ind > blockIndent) return;
      blockIndent = -1;
    }
    if (line.trimStart().startsWith('#')) return;
    if (ind % 2) problems.push(`${n}: odd indent`);
    const body = line.trim().replace(/^- /, '');
    if (!/^[A-Za-z_][\w.-]*:( |$)/.test(body) && !line.trim().startsWith('- ')) problems.push(`${n}: not a mapping or list item: ${line}`);
    if (/: \|$/.test(line)) blockIndent = ind;
    if ((line.match(/\$\{\{/g) ?? []).length !== (line.match(/\}\}/g) ?? []).length) problems.push(`${n}: unbalanced expression`);
  });
  for (const key of ['name', 'on', 'concurrency', 'permissions', 'jobs']) {
    if (!new RegExp(`^${key}:`, 'm').test(yaml)) problems.push(`missing top-level ${key}`);
  }
  return problems;
}

// Ruby's Psych is a real YAML 1.1 parser and ships with macOS; skip the full parse where it's absent
const hasRuby = (() => {
  try { execFileSync('ruby', ['-ryaml', '-e', '1'], { stdio: 'ignore' }); return true; } catch { return false; }
})();
function parseYaml(yaml: string): any {
  const out = execFileSync('ruby', ['-ryaml', '-rjson', '-e', 'puts JSON.generate(YAML.safe_load(STDIN.read))'], {
    input: yaml, stdio: ['pipe', 'pipe', 'ignore'],
  });
  const data = JSON.parse(out.toString());
  // YAML 1.1 reads a bare `on` key as boolean true; GitHub's parser doesn't
  return { ...data, on: data.on ?? data.true };
}

describe('collectEnvSecrets', () => {
  it('collects {{env.X}} from values and URLs across hooks and tests, sorted and unique', () => {
    expect(collectEnvSecrets([login])).toEqual(['APP_HOST', 'TEST_EMAIL', 'TEST_PASSWORD']);
  });

  it('returns nothing when no step uses a placeholder', () => {
    expect(collectEnvSecrets([suite('Plain', [step('a', { type: 'navigate', url: '/home' })])])).toEqual([]);
  });
});

describe('generateCiWorkflow: web', () => {
  const yaml = generateCiWorkflow({ config: webConfig, suites: [login] });

  it('starts with the marker, and only marked files count as suziQai’s', () => {
    expect(yaml.split('\n')[0]).toBe(CI_MARKER);
    expect(isSuziqaiWorkflow(yaml)).toBe(true);
    expect(isSuziqaiWorkflow('name: CI\n' + CI_MARKER)).toBe(false);
  });

  it('lists the secrets to create and maps them from repo secrets', () => {
    expect(yaml).toMatch(/# Repo secrets to create.*\n#   APP_HOST\n#   TEST_EMAIL\n#   TEST_PASSWORD\n/);
    expect(yaml).toContain('      TEST_EMAIL: ${{ secrets.TEST_EMAIL }}');
    expect(yaml).toContain('      TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}');
  });

  it('triggers on push to main, pull requests, a nightly cron and manual dispatch, cancelling superseded runs', () => {
    expect(yaml).toContain('  push:\n    branches: ["main"]\n  pull_request:\n  schedule:\n    - cron: "0 7 * * *"\n  workflow_dispatch:');
    expect(yaml).toContain('cancel-in-progress: true');
    const custom = generateCiWorkflow({ config: webConfig, suites: [], options: { cron: '30 2 * * 1-5', branch: 'trunk' } });
    expect(custom).toContain('- cron: "30 2 * * 1-5"');
    expect(custom).toContain('branches: ["trunk"]');
    expect(custom).toContain("github.ref == 'refs/heads/trunk'");
  });

  it('installs, runs the test dir with html+github+junit, and keeps going so reports publish', () => {
    expect(yaml).toContain('node-version: lts/*');
    expect(yaml).toContain('if [ -f package-lock.json ]; then npm ci; else npm install; fi');
    expect(yaml).toContain('npx playwright install --with-deps chromium');
    expect(yaml).toContain('npx playwright test "$TEST_DIR" --reporter=html,github,junit');
    expect(yaml).toContain('TEST_DIR: "e2e"');
    expect(yaml).toMatch(/id: tests\n\s+continue-on-error: true/);
    expect(yaml).toContain("if: steps.tests.outcome == 'failure'");
  });

  it('uploads the HTML report for 14 days and writes a junit job summary', () => {
    expect(yaml).toMatch(/uses: actions\/upload-artifact@v4\n\s+with:\n\s+name: playwright-report\n\s+path: "playwright-report\/"\n\s+retention-days: 14/);
    expect(yaml).toContain('PLAYWRIGHT_JUNIT_OUTPUT_NAME: results.xml');
    expect(yaml).toContain('GITHUB_STEP_SUMMARY');
    expect(yaml).toContain("node - <<'EOF'");
  });

  it('deploys to Pages only from main and nightly runs, with the permissions Pages needs', () => {
    expect(yaml).toContain('  pages:\n');
    expect(yaml).toContain("(github.event_name == 'schedule' || github.ref == 'refs/heads/main')");
    expect(yaml).toMatch(/permissions:\n\s+pages: write\n\s+id-token: write/);
    expect(yaml).toContain('actions/upload-pages-artifact@v3');
    expect(yaml).toContain('actions/deploy-pages@v4');
    expect(yaml).toMatch(/^permissions:\n  contents: read$/m);
  });

  it('leaves the Pages job out when pages is false', () => {
    const noPages = generateCiWorkflow({ config: webConfig, suites: [login], options: { pages: false } });
    expect(noPages).not.toContain('  pages:\n');
    expect(noPages).not.toContain('deploy-pages');
    expect(noPages).not.toContain('pages: write');
  });

  it('keeps production (read-only) reports off public Pages unless asked', () => {
    const prod = { ...webConfig, readOnly: { allow: [] } };
    expect(generateCiWorkflow({ config: prod, suites: [login] })).not.toContain('deploy-pages');
    expect(generateCiWorkflow({ config: prod, suites: [login], options: { pages: true } })).toContain('deploy-pages');
  });

  it('runs from a subdirectory when the project isn’t the repo root', () => {
    const sub = generateCiWorkflow({ config: webConfig, suites: [], options: { workingDirectory: 'apps/web' } });
    expect(sub).toContain('working-directory: "apps/web"');
    expect(sub).toContain('path: "apps/web/playwright-report/"');
  });

  it('notes read-only production runs in the header without changing the command', () => {
    const ro = generateCiWorkflow({ config: { ...webConfig, readOnly: { allow: ['/login'] } }, suites: [login] });
    expect(ro).toMatch(/^# READ-ONLY: these tests run against production/m);
    expect(yaml).not.toContain('READ-ONLY');
    const cmd = (s: string) => s.split('\n').find((l) => l.includes('npx playwright test'));
    expect(cmd(ro)).toBe(cmd(yaml));
  });

  it('has no secrets block when nothing needs one', () => {
    const plain = generateCiWorkflow({ config: webConfig, suites: [] });
    expect(plain).not.toContain('secrets.');
    expect(plain).not.toContain('Repo secrets');
  });

  it('is structurally valid YAML', () => {
    expect(checkYamlStructure(yaml)).toEqual([]);
    expect(checkYamlStructure(generateCiWorkflow({ config: webConfig, suites: [], options: { pages: false, workingDirectory: 'web' } }))).toEqual([]);
  });

  it.skipIf(!hasRuby)('parses as YAML into the expected workflow', () => {
    const wf = parseYaml(yaml);
    expect(Object.keys(wf.on)).toEqual(['push', 'pull_request', 'schedule', 'workflow_dispatch']);
    expect(Object.keys(wf.jobs)).toEqual(['test', 'pages']);
    expect(wf.jobs.pages.needs).toBe('test');
    expect(wf.jobs.test.env).toEqual({
      APP_HOST: '${{ secrets.APP_HOST }}', TEST_EMAIL: '${{ secrets.TEST_EMAIL }}', TEST_PASSWORD: '${{ secrets.TEST_PASSWORD }}',
    });
    const summary = wf.jobs.test.steps.find((s: any) => s.name === 'Job summary');
    expect(summary.run).toMatch(/^node - <<'EOF'\nconst fs = require\('fs'\);[\s\S]*\nEOF\n$/);
  });
});

describe('generateCiWorkflow: junit summary script', () => {
  // Extract the inline node script and run it against a Playwright-shaped junit file
  it('counts passes and failures and names the failing tests', async () => {
    const { mkdtemp, writeFile, readFile } = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const yaml = generateCiWorkflow({ config: webConfig, suites: [] });
    const script = yaml.match(/node - <<'EOF'\n([\s\S]*?)\n\s*EOF/)![1].replace(/^ {10}/gm, '');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ci-summary-'));
    await writeFile(path.join(dir, 'results.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<testsuites id="" name="" tests="3" failures="1" skipped="0" errors="0" time="4.2">
<testsuite name="login.spec.ts" tests="3" failures="1">
<testcase name="Login flow › works" classname="login.spec.ts" time="1.0">
</testcase>
<testcase name="Login flow › bad password" classname="login.spec.ts" time="1.0">
<failure message="expected" type="FAILURE"><![CDATA[boom]]></failure>
</testcase>
<testcase name="Login flow › logout" classname="login.spec.ts" time="1.0">
</testcase>
</testsuite>
</testsuites>`);
    const summaryFile = path.join(dir, 'summary.md');
    execFileSync('node', ['-e', script], { cwd: dir, env: { ...process.env, JUNIT_FILE: 'results.xml', GITHUB_STEP_SUMMARY: summaryFile } });
    const md = await readFile(summaryFile, 'utf-8');
    expect(md).toContain('| 2 | 1 | 0 | 3 |');
    expect(md).toContain('- login.spec.ts › Login flow › bad password');
    expect(md).not.toContain('› works');
  });
});

describe('generateCiWorkflow: iOS', () => {
  const careTeam = suite('Care Team', [step('t1', { type: 'fill', selector: '{"type":"textField","index":0}', value: '{{env.VET_EMAIL}}' })]);
  const schedule = suite('Schedule', [step('t2', { type: 'click', selector: '{"type":"button","index":0}' })]);
  const opts = { ios: { projectDir: 'ios', scheme: 'PetHomepage', uiTestTarget: 'PetHomepageUITests' } };
  const yaml = generateCiWorkflow({ config: iosConfig, suites: [careTeam, schedule], options: opts });

  it('runs on macOS in the project dir, generating the project when there’s a project.yml', () => {
    expect(yaml.split('\n')[0]).toBe(CI_MARKER);
    expect(yaml).toContain('runs-on: macos-latest');
    expect(yaml).toContain('working-directory: "ios"');
    expect(yaml).toContain('if [ -f project.yml ]; then brew install xcodegen && xcodegen generate; fi');
  });

  it('runs only the suites’ classes, named like the exported XCUITests', () => {
    expect(yaml).toContain('-scheme "PetHomepage"');
    expect(yaml).toContain('"-only-testing:PetHomepageUITests/CareTeamTests" "-only-testing:PetHomepageUITests/ScheduleTests"');
    expect(yaml).toContain('-destination "platform=iOS Simulator,name=$DEVICE"');
    expect(yaml).toContain('-resultBundlePath TestResults.xcresult');
  });

  it('defaults to a common simulator, overridable on dispatch, falling back to any iPhone', () => {
    expect(yaml).toContain("WANTED: ${{ inputs.device || 'iPhone 16' }}");
    expect(yaml).toMatch(/workflow_dispatch:\n\s+inputs:\n\s+device:/);
    expect(yaml).toContain("grep -m1 -oE 'iPhone[^(]*'");
    const custom = generateCiWorkflow({ config: iosConfig, suites: [careTeam], options: { ios: { ...opts.ios, device: "Bob's iPhone" } } });
    expect(custom).toContain("inputs.device || 'Bob''s iPhone'");
  });

  it('uploads the result bundle and summarizes it with xcresulttool', () => {
    expect(yaml).toContain('path: "ios/TestResults.xcresult"');
    expect(yaml).toContain('xcrun xcresulttool get test-results summary --path TestResults.xcresult > summary.json');
    expect(yaml).toContain('GITHUB_STEP_SUMMARY');
  });

  it('passes secrets to the test runner with the TEST_RUNNER_ prefix', () => {
    expect(yaml).toContain('TEST_RUNNER_VET_EMAIL: ${{ secrets.VET_EMAIL }}');
    expect(yaml).toMatch(/#   VET_EMAIL\n/);
  });

  it('has no Pages job and runs the whole UI test target before any suite exists', () => {
    expect(yaml).not.toContain('deploy-pages');
    const empty = generateCiWorkflow({ config: iosConfig, suites: [], options: opts });
    expect(empty).toContain('"-only-testing:PetHomepageUITests"');
  });

  it('is structurally valid YAML', () => {
    expect(checkYamlStructure(yaml)).toEqual([]);
  });

  it.skipIf(!hasRuby)('parses as YAML into the expected workflow', () => {
    const wf = parseYaml(yaml);
    expect(Object.keys(wf.jobs)).toEqual(['test']);
    expect(wf.on.workflow_dispatch.inputs.device.default).toBe('iPhone 16');
    const run = wf.jobs.test.steps.find((s: any) => s.name === 'Run suites').run;
    expect(run).toContain('xcodebuild test \\\n  -scheme "PetHomepage"');
  });
});

describe('generateCiWorkflow: xcresult summary script', () => {
  it('renders counts and failing tests from xcresulttool JSON', async () => {
    const { mkdtemp, writeFile, readFile } = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const yaml = generateCiWorkflow({ config: iosConfig, suites: [], options: { ios: { scheme: 'App' } } });
    const script = yaml.match(/node - <<'EOF'\n([\s\S]*?)\n\s*EOF/)![1].replace(/^ {10}/gm, '');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ci-xcsummary-'));
    await writeFile(path.join(dir, 'summary.json'), JSON.stringify({
      result: 'Failed', totalTestCount: 4, passedTests: 3, failedTests: 1, skippedTests: 0,
      testFailures: [{ testName: 'testAddVet()', targetName: 'AppUITests', testIdentifierString: 'CareTeamTests/testAddVet()', failureText: 'XCTAssertTrue failed\nmore' }],
    }));
    const summaryFile = path.join(dir, 'summary.md');
    execFileSync('node', ['-e', script], { cwd: dir, env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile } });
    const md = await readFile(summaryFile, 'utf-8');
    expect(md).toContain('| 3 | 1 | 0 | 4 |');
    expect(md).toContain('- CareTeamTests/testAddVet(): XCTAssertTrue failed');
  });
});
