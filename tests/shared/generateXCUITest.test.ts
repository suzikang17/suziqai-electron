import { describe, it, expect } from 'vitest';
import { generateXCUITest, xcuiElement } from '../../src/shared/utils/generateXCUITest';
import type { TestSuite } from '../../src/shared/types';

const q = (o: object) => JSON.stringify(o);

describe('xcuiElement', () => {
  it('queries by type, identifier and label, with an index', () => {
    expect(xcuiElement(q({ type: 'button', id: 'scheduleRow.Breakfast', label: 'circle', index: 0 }))).toBe(
      'app.buttons.matching(NSPredicate(format: "identifier == %@ AND label == %@", "scheduleRow.Breakfast", "circle")).element(boundBy: 0)',
    );
  });

  it('handles label-only elements and other types', () => {
    expect(xcuiElement(q({ type: 'textField', label: 'Name', index: 1 }))).toBe(
      'app.textFields.matching(NSPredicate(format: "label == %@", "Name")).element(boundBy: 1)',
    );
  });

  it('queries unlabelled fields by placeholder', () => {
    expect(xcuiElement(q({ type: 'textField', placeholder: 'Name', index: 0 }))).toBe(
      'app.textFields.matching(NSPredicate(format: "placeholderValue == %@", "Name")).element(boundBy: 0)',
    );
  });

  it('exports labelContains as a CONTAINS predicate', () => {
    expect(xcuiElement(q({ type: 'staticText', id: 'row.Breakfast', labelContains: 'Done at', index: 0 }))).toBe(
      'app.staticTexts.matching(NSPredicate(format: "identifier == %@ AND label CONTAINS %@", "row.Breakfast", "Done at")).element(boundBy: 0)',
    );
  });

  it('targets system alert buttons through SpringBoard', () => {
    expect(xcuiElement(q({ alert: 'Allow' }))).toBe(
      'XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.buttons["Allow"]',
    );
  });

  it('returns null for unresolved (description) selectors', () => {
    expect(xcuiElement('the save button')).toBeNull();
  });

  it('escapes quotes and backslashes in Swift strings', () => {
    expect(xcuiElement(q({ type: 'button', label: 'Say "hi" \\ bye', index: 0 }))).toContain('"Say \\"hi\\" \\\\ bye"');
  });
});

describe('generateXCUITest', () => {
  const suite: TestSuite = {
    id: 's', name: 'Care team', fileName: 'care-team',
    beforeAll: [], afterEach: [], afterAll: [],
    beforeEach: [],
    tests: [{
      id: 'b1', name: 'add a vet', steps: [
        { id: '1', label: 'Open Care Team', action: { type: 'click', selector: q({ type: 'button', label: 'Care Team', index: 0 }) }, status: 'passed' },
        { id: '2', label: 'Enter name', action: { type: 'fill', selector: q({ type: 'textField', label: 'Name', index: 0 }), value: 'Dr. Paws' }, status: 'passed' },
        { id: '3', label: 'Submit', action: { type: 'press', selector: q({ type: 'textField', label: 'Name', index: 0 }), key: 'Enter' }, status: 'passed' },
        { id: '4', label: 'Name shows', action: { type: 'assert', assertionType: 'visible', expected: '', selector: q({ type: 'staticText', label: 'Dr. Paws', index: 0 }) }, status: 'passed' },
        { id: '5', label: 'Tap save', action: { type: 'click', selector: 'the save button' }, status: 'pending' },
        { id: '6', label: 'Broke', action: { type: 'click', selector: q({ type: 'button', label: 'X', index: 0 }) }, status: 'failed' },
      ],
    }],
    devices: [],
  };

  const code = generateXCUITest(suite, { bundleId: 'pet.homepage.PetHomepage', launchArgs: ['--uitest'] });

  it('writes an XCTestCase that launches the app under test with its arguments', () => {
    expect(code).toContain('final class CareTeamTests: XCTestCase {');
    expect(code).toContain('app = XCUIApplication(bundleIdentifier: "pet.homepage.PetHomepage")');
    expect(code).toContain('app.launchArguments = ["--uitest"]');
    expect(code).toContain('func testAddAVet() throws {');
  });

  it('turns steps into waits, taps, typing and assertions', () => {
    expect(code).toContain('XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label == %@", "Care Team")).element(boundBy: 0).waitForExistence(timeout: 5))');
    expect(code).toMatch(/\.tap\(\)/);
    expect(code).toContain('.typeText("Dr. Paws")');
    expect(code).toContain('.typeText("\\n")');
    expect(code).toContain('XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label == %@", "Dr. Paws")).element(boundBy: 0).waitForExistence(timeout: 5))');
  });

  it('flags unresolved steps and skips failed ones', () => {
    expect(code).toContain('// TODO: unresolved step "Tap save" (the save button) — run it in suziQai to resolve');
    expect(code).not.toContain('"X"');
  });
});
