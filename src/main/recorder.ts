export interface RecordedEvent {
  type: 'click' | 'fill' | 'navigate' | 'keypress';
  selector?: string;
  value?: string;
  url?: string;
  timestamp: number;
}

type EventCallback = (event: RecordedEvent) => void;

export class Recorder {
  private events: RecordedEvent[] = [];
  private callback: EventCallback | null = null;
  private isRecording = false;

  async start(callback: EventCallback): Promise<void> {
    this.events = [];
    this.callback = callback;
    this.isRecording = true;
  }

  stop(): RecordedEvent[] {
    this.isRecording = false;
    this.callback = null;
    return [...this.events];
  }

  pushEvent(event: RecordedEvent): void {
    if (!this.isRecording) return;
    this.events.push(event);
    this.callback?.(event);
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }
}
