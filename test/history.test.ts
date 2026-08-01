import { describe, it, expect } from 'vitest';
import { SessionHistory } from '../src/history.js';
import type { HistoryEntry } from '../src/types.js';

function entry(targetDescription: string, ts: string): HistoryEntry {
  return { actionType: 'click', targetDescription, finalDecision: 'allowed', decisionSource: 'rule', ts };
}

describe('SessionHistory', () => {
  it('returns entries in insertion order', () => {
    const history = new SessionHistory(10);
    history.add(entry('a', '2026-08-01T00:00:00Z'));
    history.add(entry('b', '2026-08-01T00:00:01Z'));
    expect(history.recent().map((e) => e.targetDescription)).toEqual(['a', 'b']);
  });

  it('drops the oldest entry once maxSize is exceeded', () => {
    const history = new SessionHistory(2);
    history.add(entry('a', '1'));
    history.add(entry('b', '2'));
    history.add(entry('c', '3'));
    expect(history.recent().map((e) => e.targetDescription)).toEqual(['b', 'c']);
  });

  it('defaults to a max size of 10', () => {
    const history = new SessionHistory();
    for (let i = 0; i < 15; i++) {
      history.add(entry(String(i), String(i)));
    }
    expect(history.recent()).toHaveLength(10);
    expect(history.recent()[0].targetDescription).toBe('5');
  });
});
