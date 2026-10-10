// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readScreen, toCandidates, findByQuery, queryFor, type IosNode } from '../../src/main/ios-driver';

const node = (type: string, label = '', id = '', children?: IosNode[], extra: Partial<IosNode> = {}): IosNode => ({
  type, label, id, enabled: true, selected: false, frame: [0, 0, 10, 10], ...(children ? { children } : {}), ...extra,
});

const tree = node('application', 'Pet', '', [
  node('window', '', '', [
    node('button', 'gearshape.fill', 'gearshape.fill'),
    node('staticText', 'Care routine'),
    node('button', 'circle', 'scheduleRow.Breakfast'),
    node('button', 'circle', 'scheduleRow.Dinner'),
    node('button', 'Add', '', undefined, { enabled: false }),
    node('textField', '', 'petName', undefined, { placeholder: 'Pet name' }),
    node('tabBar', '', '', [node('button', 'Home'), node('button', 'Schedule')]),
  ]),
]);

describe('readScreen', () => {
  it('returns actionable, enabled elements in document order', () => {
    expect(readScreen(tree).actionable.map((e) => e.id || e.label)).toEqual([
      'gearshape.fill', 'scheduleRow.Breakfast', 'scheduleRow.Dinner', 'petName', 'Home', 'Schedule',
    ]);
  });
});

describe('toCandidates', () => {
  const screen = readScreen(tree);
  const candidates = toCandidates(screen.actionable, screen.all);

  it('names elements by label and identifier so Jev can use either', () => {
    expect(candidates[1].name).toBe('circle (id: scheduleRow.Breakfast)');
    expect(candidates[0].name).toBe('gearshape.fill');
    expect(candidates[3].name).toBe('Pet name (id: petName)');
    expect(candidates[1].role).toBe('button');
  });

  it('queries by a unique developer identifier alone, so label changes do not break it', () => {
    expect(JSON.parse(candidates[1].locator)).toEqual({ type: 'button', id: 'scheduleRow.Breakfast', index: 0 });
    expect(JSON.parse(candidates[3].locator)).toEqual({ type: 'textField', id: 'petName', index: 0 });
  });

  it('keeps the label when the identifier is just an icon name', () => {
    expect(JSON.parse(candidates[0].locator)).toEqual({ type: 'button', id: 'gearshape.fill', label: 'gearshape.fill', index: 0 });
    expect(JSON.parse(candidates[4].locator)).toEqual({ type: 'button', label: 'Home', index: 0 });
  });

  it('matches labels with times or counts by their stable prefix', () => {
    const s = readScreen(node('application', '', '', [
      node('staticText', 'Breakfast', 'scheduleRow.Breakfast'),
      node('staticText', 'Done at 12:14 AM', 'scheduleRow.Breakfast'),
    ]));
    const q = queryFor(s.all[2], s.all);
    expect(q).toEqual({ type: 'staticText', id: 'scheduleRow.Breakfast', labelContains: 'Done at', index: 0 });
    expect(findByQuery(s.all, q)).toBe(s.all[2]);
    // a later run, different time
    const later = readScreen(node('application', '', '', [node('staticText', 'Done at 9:03 PM', 'scheduleRow.Breakfast')]));
    expect(findByQuery(later.all, q)?.label).toBe('Done at 9:03 PM');
  });

  it('queries unlabelled fields without identifiers by placeholder', () => {
    const s = readScreen(node('application', '', '', [node('textField', '', '', undefined, { placeholder: 'Name' })]));
    expect(queryFor(s.actionable[0], s.all)).toEqual({ type: 'textField', placeholder: 'Name', index: 0 });
  });

  it('indexes the same way XCUITest counts matches, and findByQuery inverts it', () => {
    // Same label, different ids: a label query must count both
    const s = readScreen(node('application', '', '', [
      node('switch', 'On', 'wifi'), node('switch', 'On', 'bluetooth'), node('switch', 'On'),
    ]));
    const third = queryFor(s.actionable[2], s.all);
    expect(third).toEqual({ type: 'switch', label: 'On', index: 2 });
    expect(findByQuery(s.all, third)).toBe(s.actionable[2]);
    expect(findByQuery(s.all, { type: 'switch', id: 'bluetooth', index: 0 })).toBe(s.actionable[1]);
  });
});
