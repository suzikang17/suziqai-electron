export interface PageState {
  url: string;
  title: string;
  visibleText: string[];
  timestamp?: number;
}

export class Observer {
  private stateHistory: PageState[] = [];
  private isObserving = false;

  start(): void {
    this.stateHistory = [];
    this.isObserving = true;
  }

  stop(): void {
    this.isObserving = false;
    this.stateHistory = [];
  }

  recordState(state: PageState): void {
    if (!this.isObserving) return;
    this.stateHistory.push({
      ...state,
      timestamp: state.timestamp ?? Date.now(),
    });
  }

  getStateHistory(): PageState[] {
    return [...this.stateHistory];
  }

  getSummary(): string {
    if (this.stateHistory.length === 0) return 'No pages observed yet.';

    const lines = this.stateHistory.map((state, i) => {
      const texts = state.visibleText.slice(0, 5).join(', ');
      return `${i + 1}. ${state.url} (${state.title}) — visible: [${texts}]`;
    });

    return `Observed ${this.stateHistory.length} page states:\n${lines.join('\n')}`;
  }

  getIsObserving(): boolean {
    return this.isObserving;
  }
}
