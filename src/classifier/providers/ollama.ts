import type { JudgeInput, JudgeResult, LlmJudgeProvider } from '../../types.js';
import { formatJudgePrompt, parseJudgeResponse } from '../judgePrompt.js';

export interface OllamaJudgeProviderOptions {
  baseUrl?: string;
  model?: string;
}

export class OllamaJudgeProvider implements LlmJudgeProvider {
  private baseUrl: string;
  private model: string;

  constructor(options: OllamaJudgeProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434';
    this.model = options.model ?? 'llama3.1';
  }

  async judge(input: JudgeInput): Promise<JudgeResult> {
    const prompt = formatJudgePrompt(input);
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { response: string };
    return parseJudgeResponse(data.response);
  }
}
