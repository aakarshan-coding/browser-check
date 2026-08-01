import { describe, it, expect } from 'vitest';
import { RuleClassifier } from '../src/classifier/rules.js';
import type { DomContext } from '../src/types.js';

function domContext(overrides: Partial<DomContext> = {}): DomContext {
  return {
    tag: 'button',
    text: '',
    attributes: {},
    nearbyText: '',
    formFieldNames: [],
    ...overrides,
  };
}

describe('RuleClassifier', () => {
  const classifier = new RuleClassifier();

  it('flags destructive keyword text as unsafe', () => {
    const verdict = classifier.check({
      actionType: 'click',
      goal: 'browse products',
      domContext: domContext({ text: 'Delete Account' }),
    });
    expect(verdict).toBe('unsafe');
  });

  it('flags payment-shaped forms as unsafe', () => {
    const verdict = classifier.check({
      actionType: 'click',
      goal: 'buy shoes',
      domContext: domContext({ text: 'Submit', formFieldNames: ['card-number', 'cvv'] }),
    });
    expect(verdict).toBe('unsafe');
  });

  it('treats a fill with no signals as safe', () => {
    const verdict = classifier.check({
      actionType: 'fill',
      goal: 'search for shoes',
      domContext: domContext({ text: '' }),
    });
    expect(verdict).toBe('safe');
  });

  it('treats an unmatched click as ambiguous', () => {
    const verdict = classifier.check({
      actionType: 'click',
      goal: 'browse products',
      domContext: domContext({ text: 'View Details' }),
    });
    expect(verdict).toBe('ambiguous');
  });

  it('applies caller-supplied custom rules', () => {
    const customClassifier = new RuleClassifier([
      {
        name: 'block-logout',
        test: ({ domContext }) => (domContext.text === 'Log Out' ? 'unsafe' : null),
      },
    ]);
    const verdict = customClassifier.check({
      actionType: 'click',
      goal: 'browse products',
      domContext: domContext({ text: 'Log Out' }),
    });
    expect(verdict).toBe('unsafe');
  });
});
