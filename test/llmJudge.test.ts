import { describe, it, expect, vi } from 'vitest';
import { LlmJudge } from '../src/llmJudge.js';
import type { JudgeInput, LlmJudgeProvider } from '../src/types.js';

function judgeInput(): JudgeInput {
  return {
    goal: 'search for shoes',
    actionType: 'click',
    targetDescription: 'button[text="View Details"]',
    domContext: { tag: 'button', text: 'View Details', attributes: {}, nearbyText: '', formFieldNames: [] },
    recentHistory: [],
  };
}

describe('LlmJudge', () => {
  it('returns the provider verdict when the provider succeeds', async () => {
    const provider: LlmJudgeProvider = { judge: vi.fn().mockResolvedValue({ verdict: 'safe', reason: 'benign navigation' }) };
    const judge = new LlmJudge(provider);
    const result = await judge.check(judgeInput());
    expect(result).toEqual({ verdict: 'safe', reason: 'benign navigation' });
  });

  it('fails closed to unsafe when the provider throws', async () => {
    const provider: LlmJudgeProvider = { judge: vi.fn().mockRejectedValue(new Error('connection refused')) };
    const judge = new LlmJudge(provider);
    const result = await judge.check(judgeInput());
    expect(result.verdict).toBe('unsafe');
    expect(result.reason).toContain('connection refused');
  });
});
