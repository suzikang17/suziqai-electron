import type { Step, StepAction, TestSuite } from '@shared/types';

// iOS steps store their selector as a JSON query from the iOS driver:
// { type, id?, label?, index } for app elements, or { alert: "<button>" } for system alerts.
// A selector that isn't JSON is a description that hasn't been resolved on a device yet.

export interface XCUITestOptions {
  bundleId: string;
  launchArgs?: string[];
}

interface ElementQuery {
  type?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  labelContains?: string;
  index?: number;
  alert?: string;
}

const COLLECTIONS: Record<string, string> = {
  button: 'buttons', textField: 'textFields', secureTextField: 'secureTextFields', textView: 'textViews',
  searchField: 'searchFields', staticText: 'staticTexts', cell: 'cells', switch: 'switches', toggle: 'toggles',
  link: 'links', image: 'images', segmentedControl: 'segmentedControls', slider: 'sliders',
  stepper: 'steppers', picker: 'pickers', datePicker: 'datePickers', menuItem: 'menuItems',
};

export function swiftString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function parseQuery(selector: string): ElementQuery | null {
  if (!selector.trim().startsWith('{')) return null;
  try {
    return JSON.parse(selector) as ElementQuery;
  } catch {
    return null;
  }
}

/** Swift expression for the element a step targets, or null if the selector is unresolved. */
export function xcuiElement(selector: string): string | null {
  const q = parseQuery(selector);
  if (!q) return null;
  if (q.alert) return `XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.buttons[${swiftString(q.alert)}]`;

  const collection = (q.type && COLLECTIONS[q.type]) ?? `descendants(matching: .${q.type ?? 'any'})`;
  const clauses: string[] = [];
  const args: string[] = [];
  if (q.id) { clauses.push('identifier == %@'); args.push(swiftString(q.id)); }
  if (q.label) { clauses.push('label == %@'); args.push(swiftString(q.label)); }
  if (q.labelContains) { clauses.push('label CONTAINS %@'); args.push(swiftString(q.labelContains)); }
  if (q.placeholder) { clauses.push('placeholderValue == %@'); args.push(swiftString(q.placeholder)); }
  const matching = clauses.length
    ? `.matching(NSPredicate(format: "${clauses.join(' AND ')}", ${args.join(', ')}))`
    : '';
  return `app.${collection}${matching}.element(boundBy: ${q.index ?? 0})`;
}

function waitFor(el: string): string {
  return `XCTAssertTrue(${el}.waitForExistence(timeout: 5))`;
}

function stepLines(step: Step): string[] {
  const a: StepAction = step.action;
  const comment = `// ${step.label.replace(/\n/g, ' ')}`;

  if (a.type === 'navigate') return [comment, 'app.launch()'];
  if (a.type === 'screenshot') return [comment, 'add(XCTAttachment(screenshot: app.screenshot()))'];

  const selector = 'selector' in a ? a.selector ?? '' : '';
  const el = xcuiElement(selector);
  if (!el) return [`// TODO: unresolved step "${step.label}" (${selector}) — run it in suziQai to resolve`];

  switch (a.type) {
    case 'click':
      return [comment, waitFor(el), `${el}.tap()`];
    case 'fill':
      return [comment, waitFor(el), `${el}.tap()`, `${el}.typeText(${swiftString(a.value)})`];
    case 'press':
      return a.key === 'Enter'
        ? [comment, waitFor(el), `${el}.typeText("\\n")`]
        : [`// TODO: key "${a.key}" isn't supported on iOS — "${step.label}"`];
    case 'waitFor':
      return [comment, waitFor(el)];
    case 'assert':
      if (a.assertionType === 'visible') return [comment, waitFor(el)];
      if (a.assertionType === 'hidden') return [comment, `XCTAssertFalse(${el}.exists)`];
      if (a.assertionType === 'text') return [comment, waitFor(el), `XCTAssertTrue(${el}.label.contains(${swiftString(a.expected)}))`];
      if (a.assertionType === 'value') return [comment, waitFor(el), `XCTAssertEqual(${el}.value as? String, ${swiftString(a.expected)})`];
      return [`// TODO: "${a.assertionType}" assertions aren't supported on iOS yet — "${step.label}"`];
  }
}

function words(s: string): string[] {
  return s.split(/[^A-Za-z0-9]+/).filter(Boolean);
}

function pascal(s: string): string {
  return words(s).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Suite';
}

function body(steps: Step[], indent: string): string {
  return steps
    .filter((s) => s.status !== 'failed')
    .flatMap(stepLines)
    .map((line) => indent + line)
    .join('\n');
}

export function generateXCUITest(suite: TestSuite, opts: XCUITestOptions): string {
  const setupSteps = body(suite.beforeEach, '        ');
  const seen = new Map<string, number>();
  const tests = suite.tests
    .map((block) => {
      const base = pascal(block.name);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return `    func test${base}${n > 1 ? n : ''}() throws {\n${body(block.steps, '        ')}\n    }`;
    })
    .join('\n\n');

  const launch = (indent: string) =>
    `${indent}app = XCUIApplication(bundleIdentifier: ${swiftString(opts.bundleId)})\n` +
    `${indent}app.launchArguments = [${(opts.launchArgs ?? []).map(swiftString).join(', ')}]\n` +
    `${indent}app.launch()`;

  const beforeAll = body(suite.beforeAll, '            ');
  const setUp = [
    `        continueAfterFailure = false`,
    launch('        '),
    // XCTest has no instance-level "before all": run those steps once, in the first test's setUp
    beforeAll ? `        if !Self.didRunBeforeAll {\n            Self.didRunBeforeAll = true\n${beforeAll}\n        }` : '',
    setupSteps,
  ].filter(Boolean).join('\n');

  const afterEach = body(suite.afterEach, '        ');
  const tearDown = afterEach ? `\n    override func tearDownWithError() throws {\n${afterEach}\n    }\n` : '';

  // Class-level teardown has no test instance: launch the app on its own for the afterAll steps
  const afterAll = body(suite.afterAll, '        ');
  const classTearDown = afterAll
    ? `\n    override class func tearDown() {\n        let app = XCUIApplication(bundleIdentifier: ${swiftString(opts.bundleId)})\n        app.launchArguments = [${(opts.launchArgs ?? []).map(swiftString).join(', ')}]\n        app.launch()\n${afterAll}\n        super.tearDown()\n    }\n`
    : '';

  return `// Generated by suziQai
import XCTest

final class ${pascal(suite.name)}Tests: XCTestCase {
    var app: XCUIApplication!${beforeAll ? '\n    private static var didRunBeforeAll = false' : ''}

    override func setUpWithError() throws {
${setUp}
    }
${tearDown}${classTearDown}
${tests}
}
`;
}
