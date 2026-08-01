import { appendFile } from 'node:fs/promises';

export interface AuditLogEntry {
  ts: string;
  action: string;
  target: string;
  domContext: unknown;
  ruleVerdict: string;
  llmVerdict: string | null;
  finalDecision: 'allowed' | 'blocked';
  decisionSource: 'rule' | 'llm' | 'human';
  reason: string;
}

export class AuditLog {
  private logPath: string;

  constructor(logPath: string = './browser-check.log.jsonl') {
    this.logPath = logPath;
  }

  async write(entry: AuditLogEntry): Promise<void> {
    await appendFile(this.logPath, JSON.stringify(entry) + '\n', 'utf-8');
  }
}
