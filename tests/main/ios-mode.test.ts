// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { chooseSimulator } from '../../src/main/ios-mode';

const sim = (udid: string, name: string, state = 'Shutdown') => ({ udid, name, state, isAvailable: true });

describe('chooseSimulator', () => {
  const devices = [sim('a', 'iPhone 16'), sim('b', 'iPhone 17 Pro', 'Booted'), sim('c', 'iPhone SE', 'Booted'), sim('d', 'iPad Air')];

  it('prefers the saved simulator', () => {
    expect(chooseSimulator(devices, { saved: 'a', withApp: [] })).toBe('a');
  });

  it('prefers the newest install over a booted simulator with a stale build', () => {
    expect(chooseSimulator(devices, { withApp: ['a', 'c'] })).toBe('a');
  });

  it('then the iPhone with the most recent install of the app, booted or not', () => {
    expect(chooseSimulator(devices, { withApp: ['a'] })).toBe('a');
    // withApp is newest-install first, regardless of list order
    expect(chooseSimulator([sim('a', 'iPhone 16'), sim('e', 'iPhone 17')], { withApp: ['a', 'e'] })).toBe('a');
  });

  it('then any booted iPhone, then the newest iPhone', () => {
    expect(chooseSimulator(devices, { withApp: [] })).toBe('b');
    expect(chooseSimulator([sim('a', 'iPhone 16'), sim('e', 'iPhone 17')], { withApp: [] })).toBe('e');
  });

  it('ignores a saved simulator that no longer exists, and non-iPhones', () => {
    expect(chooseSimulator([sim('d', 'iPad Air'), sim('a', 'iPhone 16')], { saved: 'gone', withApp: [] })).toBe('a');
  });

  it('fails clearly when there is no iPhone simulator', () => {
    expect(() => chooseSimulator([sim('d', 'iPad Air')], { withApp: [] })).toThrow(/No iPhone simulator/);
  });
});
