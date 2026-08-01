import type { JudgeInput, JudgeResult, LlmJudgeProvider } from './types.js';

export class LlmJudge {
  constructor(private provider: LlmJudgeProvider) {}

  async check(input: JudgeInput): Promise<JudgeResult> {
    try {
      return await this.provider.judge(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { verdict: 'unsafe', reason: `LLM judge failed, failing closed: ${message}` };
    }
  }
}
