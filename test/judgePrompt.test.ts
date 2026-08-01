import { describe, it, expect } from 'vitest';
import { formatJudgePrompt, parseJudgeResponse } from '../src/classifier/judgePrompt.js';
import type { JudgeInput } from '../src/types.js';

function judgeInput(): JudgeInput {
  return {
    goal: 'search for shoes',
    actionType: 'click',
    targetDescription: 'button[text="View Details"]',
    domContext: { tag: 'button', text: 'View Details', attributes: {}, nearbyText: '', formFieldNames: [] },
    recentHistory: [
      { actionType: 'fill', targetDescription: 'input#search', finalDecision: 'allowed', decisionSource: 'rule', ts: '2026-08-01T00:00:00Z' },
    ],
  };
}

describe('formatJudgePrompt', () => {
  it('includes the goal, action, target text, and history', () => {
    const prompt = formatJudgePrompt(judgeInput());
    expect(prompt).toContain('search for shoes');
    expect(prompt).toContain('click');
    expect(prompt).toContain('View Details');
    expect(prompt).toContain('input#search');
  });

  it('renders "(none)" when history is empty', () => {
    const input = judgeInput();
    input.recentHistory = [];
    const prompt = formatJudgePrompt(input);
    expect(prompt).toContain('(none)');
  });
});

describe('parseJudgeResponse', () => {
  it('parses a clean JSON verdict', () => {
    const result = parseJudgeResponse('{"verdict": "safe", "reason": "benign navigation"}');
    expect(result).toEqual({ verdict: 'safe', reason: 'benign navigation' });
  });

  it('extracts JSON embedded in surrounding prose', () => {
    const result = parseJudgeResponse('Here is my answer:\n{"verdict": "unsafe", "reason": "matches delete pattern"}\nThanks.');
    expect(result).toEqual({ verdict: 'unsafe', reason: 'matches delete pattern' });
  });

  it('throws on non-JSON responses', () => {
    expect(() => parseJudgeResponse('not json at all')).toThrow('not valid JSON');
  });

  it('throws when verdict is missing or invalid', () => {
    expect(() => parseJudgeResponse('{"verdict": "maybe", "reason": "unclear"}')).toThrow('missing valid verdict');
  });
});
