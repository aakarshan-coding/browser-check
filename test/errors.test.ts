import { describe, it, expect } from 'vitest';
import { ActionBlockedError } from '../src/errors.js';

describe('ActionBlockedError', () => {
  it('carries action type, target, and reason, with a readable message', () => {
    const err = new ActionBlockedError('click', 'button[text="Delete"]', 'matched rule: destructive-keyword');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ActionBlockedError');
    expect(err.actionType).toBe('click');
    expect(err.targetDescription).toBe('button[text="Delete"]');
    expect(err.reason).toBe('matched rule: destructive-keyword');
    expect(err.message).toContain('click');
    expect(err.message).toContain('button[text="Delete"]');
  });
});
