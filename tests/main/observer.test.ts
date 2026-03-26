import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Observer } from '../../src/main/observer';

describe('Observer', () => {
  let observer: Observer;

  beforeEach(() => {
    observer = new Observer();
  });

  it('tracks page state changes', () => {
    observer.start();
    observer.recordState({
      url: 'http://localhost:3000/login',
      title: 'Login',
      visibleText: ['Email', 'Password', 'Sign In'],
    });
    observer.recordState({
      url: 'http://localhost:3000/dashboard',
      title: 'Dashboard',
      visibleText: ['Welcome back', 'Settings', 'Logout'],
    });

    const history = observer.getStateHistory();
    expect(history).toHaveLength(2);
    expect(history[0].url).toBe('http://localhost:3000/login');
    expect(history[1].url).toBe('http://localhost:3000/dashboard');
  });

  it('generates a summary of observed navigation', () => {
    observer.start();
    observer.recordState({
      url: 'http://localhost:3000/login',
      title: 'Login',
      visibleText: ['Email', 'Password', 'Sign In'],
    });
    observer.recordState({
      url: 'http://localhost:3000/dashboard',
      title: 'Dashboard',
      visibleText: ['Welcome back'],
    });

    const summary = observer.getSummary();
    expect(summary).toContain('/login');
    expect(summary).toContain('/dashboard');
  });

  it('clears history on stop', () => {
    observer.start();
    observer.recordState({ url: 'http://localhost:3000', title: 'Home', visibleText: [] });
    observer.stop();

    expect(observer.getStateHistory()).toHaveLength(0);
  });
});
