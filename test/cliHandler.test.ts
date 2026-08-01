import { describe, it, expect } from 'vitest';
import { CliEscalationHandler } from '../src/escalation/cliHandler.js';

describe('CliEscalationHandler', () => {
  it('returns true when the human answers y', async () => {
    const handler = new CliEscalationHandler(async () => 'y');
    const approved = await handler.escalate({
      actionType: 'click',
      targetDescription: 'button[text="Delete"]',
      reason: 'destructive keyword',
    });
    expect(approved).toBe(true);
  });

  it('returns false when the human answers n', async () => {
    const handler = new CliEscalationHandler(async () => 'n');
    const approved = await handler.escalate({
      actionType: 'click',
      targetDescription: 'button[text="Delete"]',
      reason: 'destructive keyword',
    });
    expect(approved).toBe(false);
  });

  it('is case-insensitive and trims whitespace', async () => {
    const handler = new CliEscalationHandler(async () => '  Y  ');
    const approved = await handler.escalate({
      actionType: 'click',
      targetDescription: 'button[text="Delete"]',
      reason: 'destructive keyword',
    });
    expect(approved).toBe(true);
  });
});
