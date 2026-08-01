import { describe, it, expect, vi } from 'vitest';
import { AnthropicJudgeProvider } from '../src/classifier/providers/anthropic.js';
import type { JudgeInput } from '../src/types.js';

function judgeInput(): JudgeInput {
  return {
    goal: 'search for shoes',
    actionType: 'click',
    targetDescription: 'button[text="Delete Account"]',
    domContext: { tag: 'button', text: 'Delete Account', attributes: {}, nearbyText: '', formFieldNames: [] },
    recentHistory: [],
  };
}

function fakeClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: responseText }] }),
    },
  };
}

describe('AnthropicJudgeProvider', () => {
  it('parses a verdict from the text content block', async () => {
    const client = fakeClient('{"verdict": "unsafe", "reason": "matches destructive pattern"}');
    const provider = new AnthropicJudgeProvider({ apiKey: 'test-key', client: client as never });
    const result = await provider.judge(judgeInput());
    expect(result).toEqual({ verdict: 'unsafe', reason: 'matches destructive pattern' });
  });

  it('calls the client with the configured model', async () => {
    const client = fakeClient('{"verdict": "safe", "reason": "ok"}');
    const provider = new AnthropicJudgeProvider({ apiKey: 'test-key', model: 'claude-haiku-4-5-20251001', client: client as never });
    await provider.judge(judgeInput());
    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    );
  });

  it('throws when the response has no text block', async () => {
    const client = { messages: { create: vi.fn().mockResolvedValue({ content: [] }) } };
    const provider = new AnthropicJudgeProvider({ apiKey: 'test-key', client: client as never });
    await expect(provider.judge(judgeInput())).rejects.toThrow('no text block');
  });
});
