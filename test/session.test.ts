import { describe, it, expect, vi } from 'vitest';
import { BrowserCheckSession } from '../src/session.js';
import { ActionBlockedError } from '../src/errors.js';
import type { EscalationHandler } from '../src/escalation/cliHandler.js';
import type { LlmJudgeProvider } from '../src/types.js';

function fakeLocator(text: string) {
  return {
    evaluate: vi.fn().mockResolvedValue({ tag: 'button', text, attributes: {}, nearbyText: '', formFieldNames: [] }),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
  } as never;
}

function autoDenyHandler(): EscalationHandler {
  return { escalate: vi.fn().mockResolvedValue(false) };
}

function autoAllowHandler(): EscalationHandler {
  return { escalate: vi.fn().mockResolvedValue(true) };
}

const stubProvider: LlmJudgeProvider = { judge: vi.fn().mockResolvedValue({ verdict: 'safe', reason: 'llm says fine' }) };

describe('BrowserCheckSession', () => {
  it('auto-allows a rule-safe fill action without escalation', async () => {
    const escalationHandler = autoDenyHandler();
    const locator = fakeLocator('');
    const session = new BrowserCheckSession({
      page: {} as never,
      goal: 'search for shoes',
      logPath: 'test-session-audit.log.jsonl',
      escalationHandler,
      llmJudgeProvider: stubProvider,
    });

    await session.fill(locator, 'shoes');

    expect(locator.fill).toHaveBeenCalledWith('shoes');
    expect(escalationHandler.escalate).not.toHaveBeenCalled();
  });

  it('escalates a rule-unsafe click and executes it when the human approves', async () => {
    const escalationHandler = autoAllowHandler();
    const locator = fakeLocator('Delete Account');
    const session = new BrowserCheckSession({
      page: {} as never,
      goal: 'manage my profile',
      logPath: 'test-session-audit.log.jsonl',
      escalationHandler,
      llmJudgeProvider: stubProvider,
    });

    await session.click(locator);

    expect(escalationHandler.escalate).toHaveBeenCalled();
    expect(locator.click).toHaveBeenCalled();
    expect(stubProvider.judge).not.toHaveBeenCalled();
  });

  it('escalates a rule-unsafe click and throws ActionBlockedError when the human denies', async () => {
    const escalationHandler = autoDenyHandler();
    const locator = fakeLocator('Delete Account');
    const session = new BrowserCheckSession({
      page: {} as never,
      goal: 'manage my profile',
      logPath: 'test-session-audit.log.jsonl',
      escalationHandler,
      llmJudgeProvider: stubProvider,
    });

    await expect(session.click(locator)).rejects.toThrow(ActionBlockedError);
    expect(locator.click).not.toHaveBeenCalled();
    expect(stubProvider.judge).not.toHaveBeenCalled();
  });

  it('falls back to the LLM judge for an ambiguous click and auto-allows on a safe verdict', async () => {
    const escalationHandler = autoDenyHandler();
    const locator = fakeLocator('View Details');
    const session = new BrowserCheckSession({
      page: {} as never,
      goal: 'browse products',
      logPath: 'test-session-audit.log.jsonl',
      escalationHandler,
      llmJudgeProvider: stubProvider,
    });

    await session.click(locator);

    expect(stubProvider.judge).toHaveBeenCalled();
    expect(escalationHandler.escalate).not.toHaveBeenCalled();
    expect(locator.click).toHaveBeenCalled();
  });
});
