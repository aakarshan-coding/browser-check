import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export interface EscalationInput {
  actionType: string;
  targetDescription: string;
  reason: string;
}

export interface EscalationHandler {
  escalate(input: EscalationInput): Promise<boolean>;
}

type QuestionFn = (prompt: string) => Promise<string>;

async function defaultAsk(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(prompt);
  rl.close();
  return answer;
}

export class CliEscalationHandler implements EscalationHandler {
  private askFn: QuestionFn;

  constructor(askFn: QuestionFn = defaultAsk) {
    this.askFn = askFn;
  }

  async escalate(input: EscalationInput): Promise<boolean> {
    console.log('\n[browser-check] Action flagged as unsafe:');
    console.log(`  Action: ${input.actionType} on ${input.targetDescription}`);
    console.log(`  Reason: ${input.reason}`);
    const answer = await this.askFn('Allow this action? (y/n) ');
    return answer.trim().toLowerCase() === 'y';
  }
}
