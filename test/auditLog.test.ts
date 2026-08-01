import { describe, it, expect, afterEach } from 'vitest';
import { readFile, unlink } from 'node:fs/promises';
import { AuditLog } from '../src/auditLog.js';

const logPath = './test-audit.log.jsonl';

afterEach(async () => {
  await unlink(logPath).catch(() => {});
});

describe('AuditLog', () => {
  it('appends one JSON line per write', async () => {
    const log = new AuditLog(logPath);
    await log.write({
      ts: '2026-08-01T00:00:00Z',
      action: 'click',
      target: 'button[text="Delete"]',
      domContext: { tag: 'button' },
      ruleVerdict: 'unsafe',
      llmVerdict: null,
      finalDecision: 'blocked',
      decisionSource: 'human',
      reason: 'matched rule: destructive-keyword',
    });
    await log.write({
      ts: '2026-08-01T00:00:01Z',
      action: 'fill',
      target: 'input#search',
      domContext: { tag: 'input' },
      ruleVerdict: 'safe',
      llmVerdict: null,
      finalDecision: 'allowed',
      decisionSource: 'rule',
      reason: 'matched rule pass: safe',
    });

    const contents = await readFile(logPath, 'utf-8');
    const lines = contents.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ action: 'click', finalDecision: 'blocked' });
    expect(JSON.parse(lines[1])).toMatchObject({ action: 'fill', finalDecision: 'allowed' });
  });
});
