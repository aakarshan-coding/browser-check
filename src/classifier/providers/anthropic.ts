import Anthropic from '@anthropic-ai/sdk';
import type { JudgeInput, JudgeResult, LlmJudgeProvider } from '../../types.js';
import { formatJudgePrompt, parseJudgeResponse } from '../judgePrompt.js';

export interface AnthropicJudgeProviderOptions {
  apiKey?: string;
  model?: string;
  client?: Anthropic;
}

export class AnthropicJudgeProvider implements LlmJudgeProvider {
  private client: Anthropic;
  private model: string;

  constructor(options: AnthropicJudgeProviderOptions = {}) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY });
    this.model = options.model ?? 'claude-haiku-4-5-20251001';
  }

  async judge(input: JudgeInput): Promise<JudgeResult> {
    const prompt = formatJudgePrompt(input);
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Anthropic response contained no text block');
    }

    return parseJudgeResponse(textBlock.text);
  }
}
