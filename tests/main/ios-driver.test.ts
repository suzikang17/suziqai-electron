// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { flattenTree, toCandidates, type IosNode } from '../../src/main/ios-driver';

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

describe('flattenTree', () => {
  it('returns actionable, enabled elements in document order', () => {
    expect(flattenTree(tree).map((e) => e.id || e.label)).toEqual([
      'gearshape.fill', 'scheduleRow.Breakfast', 'scheduleRow.Dinner', 'petName', 'Home', 'Schedule',
    ]);
  });
});

describe('toCandidates', () => {
  const candidates = toCandidates(flattenTree(tree));

  it('names elements by label and identifier so Jev can use either', () => {
    expect(candidates[1].name).toBe('circle (id: scheduleRow.Breakfast)');
    expect(candidates[0].name).toBe('gearshape.fill');
    expect(candidates[3].name).toBe('Pet name (id: petName)');
    expect(candidates[1].role).toBe('button');
  });

  it('gives each candidate a query that selects exactly it', () => {
    expect(JSON.parse(candidates[1].locator)).toEqual({ type: 'button', id: 'scheduleRow.Breakfast', label: 'circle', index: 0 });
    expect(JSON.parse(candidates[4].locator)).toEqual({ type: 'button', label: 'Home', index: 0 });
  });

  it('indexes elements that share type, id and label', () => {
    const dupes = toCandidates(flattenTree(node('application', '', '', [node('switch', 'On'), node('switch', 'On')])));
    expect(dupes.map((c) => JSON.parse(c.locator).index)).toEqual([0, 1]);
  });
});
