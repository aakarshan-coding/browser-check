import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaJudgeProvider } from '../src/classifier/providers/ollama.js';
import type { JudgeInput } from '../src/types.js';

function judgeInput(): JudgeInput {
  return {
    goal: 'search for shoes',
    actionType: 'click',
    targetDescription: 'button[text="View Details"]',
    domContext: { tag: 'button', text: 'View Details', attributes: {}, nearbyText: '', formFieldNames: [] },
    recentHistory: [],
  };
}

describe('OllamaJudgeProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('parses a verdict from the Ollama response body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: '{"verdict": "safe", "reason": "benign"}' }),
    }) as unknown as typeof fetch;

    const provider = new OllamaJudgeProvider();
    const result = await provider.judge(judgeInput());
    expect(result).toEqual({ verdict: 'safe', reason: 'benign' });
  });

  it('posts to the configured baseUrl and model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: '{"verdict": "safe", "reason": "ok"}' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new OllamaJudgeProvider({ baseUrl: 'http://localhost:9999', model: 'qwen2.5' });
    await provider.judge(judgeInput());

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/api/generate',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('qwen2.5');
  });

  it('throws when the Ollama request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' }) as unknown as typeof fetch;

    const provider = new OllamaJudgeProvider();
    await expect(provider.judge(judgeInput())).rejects.toThrow('Ollama request failed');
  });
});
