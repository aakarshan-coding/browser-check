import type { HistoryEntry } from './types.js';

export class SessionHistory {
  private entries: HistoryEntry[] = [];
  private maxSize: number;

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  add(entry: HistoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  recent(): HistoryEntry[] {
    return [...this.entries];
  }
}
