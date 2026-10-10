// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IosSession, type DriverLike } from '../../src/main/ios-session';
import type { IosNode } from '../../src/main/ios-driver';
import type { JevClient } from '../../src/main/jev-decider';

const node = (type: string, label = '', id = '', frame: [number, number, number, number] = [0, 0, 10, 10]): IosNode =>
  ({ type, label, id, enabled: true, selected: false, frame });

const screen: IosNode = {
  ...node('application', 'Pet'),
  children: [
    node('button', 'circle', 'scheduleRow.Breakfast', [10, 100, 30, 30]),
    node('textField', 'Name', '', [0, 200, 300, 40]),
    node('staticText', 'Care routine'),
  ],
};

function fakeDriver(alert: { present: boolean; buttons?: string[] } = { present: false }): DriverLike & Record<string, any> {
  return {
    tree: vi.fn(async () => screen),
    tapAt: vi.fn(async () => ({})),
    type: vi.fn(async () => ({})),
    launch: vi.fn(async () => ({})),
    alert: vi.fn(async (tap?: string) => (tap ? { present: true, tapped: tap } : alert)),
  };
}

/** Picks the candidate whose state line contains `needle`. */
function fakeJev(needle: string | null, confidence = 0.95): JevClient {
  return {
    systemOne: vi.fn(async (req: any) => {
      const line = needle ? (req.state as string).split('\n').find((l: string) => l.startsWith('[e') && l.includes(needle)) : undefined;
      const key = line ? line.match(/^\[(e\d+)\]/)![1] : 'none';
      const a = { type: 'choice', choice: key, confidence, probabilities: { [key]: 1 } };
      return { model: 'jev', answers: { target: a, target_reversed: a, action: a }, usage: { input_tokens: 1, output_tokens: 1 } };
    }),
  };
}

const app = { bundleId: 'pet.homepage.PetHomepage', launchArgs: ['--uitest'] };

describe('IosSession.execute', () => {
  let driver: ReturnType<typeof fakeDriver>;
  beforeEach(() => { driver = fakeDriver(); });

  it('resolves a described element with Jev, taps its centre, and returns the query', async () => {
    const session = new IosSession(driver, fakeJev('scheduleRow.Breakfast'), app);
    const result = await session.execute('Mark breakfast done', { type: 'click', selector: 'breakfast checkbox' });

    expect(driver.tapAt).toHaveBeenCalledWith(25, 115);
    expect(JSON.parse(result.resolvedSelector!)).toEqual({ type: 'button', id: 'scheduleRow.Breakfast', index: 0 });
  });

  it('uses a saved query directly when it still matches', async () => {
    const jev = fakeJev(null);
    const session = new IosSession(driver, jev, app);
    const selector = JSON.stringify({ type: 'textField', label: 'Name', index: 0 });
    const result = await session.execute('Enter name', { type: 'fill', selector, value: 'Dr. Paws' });

    expect(driver.type).toHaveBeenCalledWith('Dr. Paws', { type: 'textField', label: 'Name', index: 0 });
    expect(jev.systemOne).not.toHaveBeenCalled();
    expect(result.resolvedSelector).toBeUndefined();
  });

  it('re-resolves a saved query that no longer matches (self-heal)', async () => {
    const session = new IosSession(driver, fakeJev('Name'), app);
    const stale = JSON.stringify({ type: 'textField', label: 'Full name', index: 0 });
    const result = await session.execute('Enter name', { type: 'fill', selector: stale, value: 'x' });
    expect(JSON.parse(result.resolvedSelector!).label).toBe('Name');
  });

  it('refuses to act when Jev is unsure', async () => {
    const session = new IosSession(driver, fakeJev('Name', 0.2), app);
    await expect(session.execute('Do the thing', { type: 'click', selector: 'thing' })).rejects.toThrow(/not sure/);
    expect(driver.tapAt).not.toHaveBeenCalled();
  });

  it('offers system alert buttons to Jev and taps them through SpringBoard', async () => {
    driver = fakeDriver({ present: true, buttons: ["Don't Allow", 'Allow'] });
    const session = new IosSession(driver, fakeJev('alert button "Allow"'), app);
    const result = await session.execute('Allow notifications', { type: 'click', selector: 'Allow' });

    expect(driver.alert).toHaveBeenCalledWith('Allow');
    expect(JSON.parse(result.resolvedSelector!)).toEqual({ alert: 'Allow' });
  });

  it('presses Enter by typing a newline into the element', async () => {
    const session = new IosSession(driver, fakeJev(null), app);
    const selector = JSON.stringify({ type: 'textField', label: 'Name', index: 0 });
    await session.execute('Submit', { type: 'press', selector, key: 'Enter' });
    expect(driver.type).toHaveBeenCalledWith('\n', { type: 'textField', label: 'Name', index: 0 });
  });

  it('checks text assertions against every label on screen', async () => {
    const session = new IosSession(driver, null, app);
    await expect(session.execute('Shows routine', { type: 'assert', assertionType: 'text', expected: 'Care routine' })).resolves.toEqual({});
    await expect(session.execute('Shows nope', { type: 'assert', assertionType: 'text', expected: 'Nope' })).rejects.toThrow(/not on screen/);
  });

  it('checks value assertions on a resolved field', async () => {
    const field = { ...node('textField', '', '', [0, 0, 10, 10]), placeholder: 'Name', value: 'Dr. Paws' };
    driver.tree = vi.fn(async () => ({ ...node('application'), children: [field] }));
    const session = new IosSession(driver, null, app);
    const selector = JSON.stringify({ type: 'textField', placeholder: 'Name', index: 0 });
    await expect(session.execute('Name is set', { type: 'assert', assertionType: 'value', expected: 'Dr. Paws', selector })).resolves.toEqual({});
    await expect(session.execute('Name is set', { type: 'assert', assertionType: 'value', expected: 'Dr. Who', selector })).rejects.toThrow(/got "Dr. Paws"/);
  });

  it('resolves described waitFor and value targets with Jev, including non-tappable text', async () => {
    const field = { ...node('textField', '', '', [0, 0, 10, 10]), placeholder: 'Name', value: 'Dr. Paws' };
    driver.tree = vi.fn(async () => ({ ...node('application'), children: [node('staticText', 'Veterinarian'), field] }));

    const heading = await new IosSession(driver, fakeJev('Veterinarian'), app)
      .execute('Wait for the form', { type: 'waitFor', selector: 'form heading' });
    expect(JSON.parse(heading.resolvedSelector!)).toEqual({ type: 'staticText', label: 'Veterinarian', index: 0 });

    const value = await new IosSession(driver, fakeJev('Name'), app)
      .execute('Name shows Dr. Paws', { type: 'assert', assertionType: 'value', expected: 'Dr. Paws', selector: 'Name field' });
    expect(JSON.parse(value.resolvedSelector!)).toEqual({ type: 'textField', placeholder: 'Name', index: 0 });
  });

  it('matches screen-style descriptions by their visible text, without asking Jev', async () => {
    const jev = fakeJev(null);
    const result = await new IosSession(driver, jev, app).execute('Wait for routine', { type: 'waitFor', selector: 'Care routine screen heading' });
    expect(JSON.parse(result.resolvedSelector!)).toEqual({ type: 'staticText', label: 'Care routine', index: 0 });
    expect(jev.systemOne).not.toHaveBeenCalled();
  });

  it('times out a described waitFor when Jev finds nothing', async () => {
    const session = new IosSession(driver, fakeJev(null), app);
    await expect(session.execute('Wait', { type: 'waitFor', selector: 'spinner' }, 600)).rejects.toThrow(/did not appear/);
  });

  it('checks enabled/disabled and checked/unchecked on resolved elements', async () => {
    const save = { ...node('button', 'Save', '', [0, 0, 10, 10]), enabled: false };
    const toggle = { ...node('switch', 'Reminders', '', [0, 0, 10, 10]), value: '1' };
    driver.tree = vi.fn(async () => ({ ...node('application'), children: [save, toggle] }));
    const session = new IosSession(driver, null, app);
    const saveSel = JSON.stringify({ type: 'button', label: 'Save', index: 0 });
    const toggleSel = JSON.stringify({ type: 'switch', label: 'Reminders', index: 0 });

    await expect(session.execute('Save disabled', { type: 'assert', assertionType: 'disabled', expected: '', selector: saveSel })).resolves.toEqual({});
    await expect(session.execute('Save enabled', { type: 'assert', assertionType: 'enabled', expected: '', selector: saveSel })).rejects.toThrow(/is disabled/);
    await expect(session.execute('Reminders on', { type: 'assert', assertionType: 'checked', expected: '', selector: toggleSel })).resolves.toEqual({});
    await expect(session.execute('Reminders off', { type: 'assert', assertionType: 'unchecked', expected: '', selector: toggleSel })).rejects.toThrow(/is checked/);
  });

  it('relaunches the app for navigate steps', async () => {
    const session = new IosSession(driver, null, app);
    await session.execute('Restart', { type: 'navigate', url: '' });
    expect(driver.launch).toHaveBeenCalledWith('pet.homepage.PetHomepage', ['--uitest']);
  });
});

describe('IosSession.describeScreen', () => {
  it('lists actionable elements and visible text for Claude', async () => {
    const session = new IosSession(fakeDriver(), null, app);
    const text = await session.describeScreen();
    expect(text).toContain('button "circle (id: scheduleRow.Breakfast)"');
    expect(text).toContain('Care routine');
  });
});
