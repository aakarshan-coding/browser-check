import type { ClassifyInput, RuleDefinition, Verdict } from '../types.js';

const DESTRUCTIVE_KEYWORDS = [
  'delete',
  'remove',
  'cancel account',
  'deactivate',
  'confirm purchase',
  'place order',
  'submit payment',
];

const PAYMENT_FIELD_PATTERNS = [/card.?number/i, /cvv/i, /card.?expiry/i, /cvc/i];

const AMBIGUOUS_BY_DEFAULT_ACTIONS = new Set(['click', 'setInputFiles']);

export const builtInRules: RuleDefinition[] = [
  {
    name: 'destructive-keyword',
    test: ({ domContext }) => {
      const haystack = `${domContext.text} ${domContext.nearbyText}`.toLowerCase();
      return DESTRUCTIVE_KEYWORDS.some((kw) => haystack.includes(kw)) ? 'unsafe' : null;
    },
  },
  {
    name: 'payment-shaped-form',
    test: ({ domContext }) => {
      const hasPaymentField = domContext.formFieldNames.some((name) =>
        PAYMENT_FIELD_PATTERNS.some((pattern) => pattern.test(name))
      );
      return hasPaymentField ? 'unsafe' : null;
    },
  },
];

export class RuleClassifier {
  private rules: RuleDefinition[];

  constructor(customRules: RuleDefinition[] = []) {
    this.rules = [...builtInRules, ...customRules];
  }

  check(input: ClassifyInput): Verdict {
    for (const rule of this.rules) {
      const verdict = rule.test(input);
      if (verdict === 'unsafe') return 'unsafe';
    }
    return AMBIGUOUS_BY_DEFAULT_ACTIONS.has(input.actionType) ? 'ambiguous' : 'safe';
  }
}
