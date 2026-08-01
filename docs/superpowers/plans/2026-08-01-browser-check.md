# browser-check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `browser-check`, a standalone TypeScript library that wraps Playwright actions with intent verification — classifying each action against a stated goal and escalating unsafe/destructive ones to a human via CLI.

**Architecture:** `BrowserCheckSession` wraps a Playwright `Page`. Each session method (`click`, `fill`, `goto`, etc.) captures DOM context around its target, runs it through a synchronous `RuleClassifier`, falls back to an async `LlmJudge` (pluggable provider, defaults to local Ollama) when the rules are ambiguous, escalates `unsafe` verdicts to a CLI human prompt, and logs every decision to a JSONL audit file.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), Playwright, Vitest, `@anthropic-ai/sdk` (optional judge provider), Node.js >=18 built-in `fetch`.

## Global Constraints

- Standalone project: `browser-check` gets its own `package.json`/`tsconfig.json`. Do not depend on or reference sibling projects (e.g. `agent-os`) or the monorepo root `package.json`.
- ESM throughout (`"type": "module"`), TypeScript `strict: true`.
- No live LLM/network calls in the default test suite — all `LlmJudgeProvider` tests use mocked providers/fetch/SDK clients.
- Fail closed: any LLM judge provider error is treated as `unsafe`, never silently allowed.
- Two-tier decision model only: `safe` (auto-allow) or `unsafe` (escalate). No hard-block tier.

---

### Task 1: Project Scaffolding & Core Types

**Files:**
- Create: `browser-check/package.json`
- Create: `browser-check/tsconfig.json`
- Create: `browser-check/vitest.config.ts`
- Create: `browser-check/.gitignore`
- Create: `browser-check/src/types.ts`
- Create: `browser-check/src/errors.ts`
- Test: `browser-check/test/errors.test.ts`

**Interfaces:**
- Produces: `ActionType` (`'click'|'fill'|'goto'|'press'|'check'|'uncheck'|'selectOption'|'setInputFiles'`), `DomContext { tag, text, attributes, nearbyText, formFieldNames }`, `Verdict` (`'safe'|'unsafe'|'ambiguous'`), `ClassifyInput { actionType, domContext, goal }`, `RuleDefinition { name, test }`, `HistoryEntry { actionType, targetDescription, finalDecision, decisionSource, ts }`, `JudgeInput { goal, actionType, targetDescription, domContext, recentHistory }`, `JudgeResult { verdict, reason }`, `LlmJudgeProvider { judge(input): Promise<JudgeResult> }`, `ActionBlockedError` class — all consumed by every later task.

- [ ] **Step 1: Create the package directory and `package.json`**

```json
{
  "name": "browser-check",
  "version": "0.1.0",
  "type": "module",
  "description": "Intent verification for browser-automation agents: classify actions against a stated goal, escalate unsafe ones to a human.",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "playwright": "^1.47.0",
    "@anthropic-ai/sdk": "^0.30.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.7.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
*.log.jsonl
```

- [ ] **Step 5: Install dependencies and Playwright's Chromium browser**

Run: `cd browser-check && npm install && npx playwright install chromium`
Expected: installs complete without error (Chromium download may take a minute).

- [ ] **Step 6: Create `src/types.ts`**

```typescript
export type ActionType =
  | 'click'
  | 'fill'
  | 'goto'
  | 'press'
  | 'check'
  | 'uncheck'
  | 'selectOption'
  | 'setInputFiles';

export interface DomContext {
  tag: string;
  text: string;
  attributes: Record<string, string>;
  nearbyText: string;
  formFieldNames: string[];
}

export type Verdict = 'safe' | 'unsafe' | 'ambiguous';

export interface ClassifyInput {
  actionType: ActionType;
  domContext: DomContext;
  goal: string;
}

export interface RuleDefinition {
  name: string;
  test: (input: ClassifyInput) => Verdict | null;
}

export interface HistoryEntry {
  actionType: ActionType;
  targetDescription: string;
  finalDecision: 'allowed' | 'blocked';
  decisionSource: 'rule' | 'llm' | 'human';
  ts: string;
}

export interface JudgeInput {
  goal: string;
  actionType: ActionType;
  targetDescription: string;
  domContext: DomContext;
  recentHistory: HistoryEntry[];
}

export interface JudgeResult {
  verdict: 'safe' | 'unsafe';
  reason: string;
}

export interface LlmJudgeProvider {
  judge(input: JudgeInput): Promise<JudgeResult>;
}
```

- [ ] **Step 7: Write the failing test for `ActionBlockedError`**

Create `browser-check/test/errors.test.ts`:

```typescript
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
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm test -- errors.test.ts`
Expected: FAIL — `Cannot find module '../src/errors.js'`

- [ ] **Step 9: Create `src/errors.ts`**

```typescript
export class ActionBlockedError extends Error {
  actionType: string;
  targetDescription: string;
  reason: string;

  constructor(actionType: string, targetDescription: string, reason: string) {
    super(`Action blocked: ${actionType} on ${targetDescription} (${reason})`);
    this.name = 'ActionBlockedError';
    this.actionType = actionType;
    this.targetDescription = targetDescription;
    this.reason = reason;
  }
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm test -- errors.test.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add browser-check/package.json browser-check/package-lock.json browser-check/tsconfig.json browser-check/vitest.config.ts browser-check/.gitignore browser-check/src/types.ts browser-check/src/errors.ts browser-check/test/errors.test.ts
git commit -m "browser-check: scaffold project and add core types/errors"
```

---

### Task 2: DOM Context Capture

**Files:**
- Create: `browser-check/src/domContext.ts`
- Test: `browser-check/test/domContext.test.ts`

**Interfaces:**
- Consumes: `DomContext` (Task 1).
- Produces: `captureDomContext(locator: Locator): Promise<DomContext>` — consumed by Task 11 (`BrowserCheckSession`).

- [ ] **Step 1: Write the failing test**

Create `browser-check/test/domContext.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { captureDomContext } from '../src/domContext.js';

describe('captureDomContext', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent(`
      <form>
        <input name="card-number" />
        <button id="pay">Pay Now</button>
      </form>
    `);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('captures tag, text, nearby text, and form field names', async () => {
    const context = await captureDomContext(page.locator('#pay'));
    expect(context.tag).toBe('button');
    expect(context.text).toBe('Pay Now');
    expect(context.formFieldNames).toContain('card-number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- domContext.test.ts`
Expected: FAIL — `Cannot find module '../src/domContext.js'`

- [ ] **Step 3: Create `src/domContext.ts`**

```typescript
import type { Locator } from 'playwright';
import type { DomContext } from './types.js';

export async function captureDomContext(locator: Locator): Promise<DomContext> {
  return locator.evaluate((el) => {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().slice(0, 200);

    const attributes: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      attributes[attr.name] = attr.value;
    }

    const parent = el.parentElement;
    const nearbyText = parent ? (parent.textContent || '').trim().slice(0, 300) : '';

    const form = el.closest('form');
    const formFieldNames: string[] = form
      ? Array.from(form.querySelectorAll('input, select, textarea')).map(
          (f) => (f as HTMLInputElement).name || (f as HTMLInputElement).type || ''
        )
      : [];

    return { tag, text, attributes, nearbyText, formFieldNames };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- domContext.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add browser-check/src/domContext.ts browser-check/test/domContext.test.ts
git commit -m "browser-check: add DOM context capture"
```

---

### Task 3: Rule Classifier

**Files:**
- Create: `browser-check/src/classifier/rules.ts`
- Test: `browser-check/test/rules.test.ts`

**Interfaces:**
- Consumes: `ClassifyInput`, `RuleDefinition`, `Verdict` (Task 1).
- Produces: `builtInRules: RuleDefinition[]`, `class RuleClassifier { constructor(customRules?: RuleDefinition[]); check(input: ClassifyInput): Verdict }` — consumed by Task 11.

- [ ] **Step 1: Write the failing test**

Create `browser-check/test/rules.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rules.test.ts`
Expected: FAIL — `Cannot find module '../src/classifier/rules.js'`

- [ ] **Step 3: Create `src/classifier/rules.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rules.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add browser-check/src/classifier/rules.ts browser-check/test/rules.test.ts
git commit -m "browser-check: add rule-based classifier"
```

---

### Task 4: LLM Judge Prompt Template & Response Parsing

**Files:**
- Create: `browser-check/src/classifier/judgePrompt.ts`
- Test: `browser-check/test/judgePrompt.test.ts`

**Interfaces:**
- Consumes: `JudgeInput`, `JudgeResult` (Task 1).
- Produces: `formatJudgePrompt(input: JudgeInput): string`, `parseJudgeResponse(raw: string): JudgeResult` — consumed by Task 5 and Task 6 (provider implementations).

- [ ] **Step 1: Write the failing test**

Create `browser-check/test/judgePrompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatJudgePrompt, parseJudgeResponse } from '../src/classifier/judgePrompt.js';
import type { JudgeInput } from '../src/types.js';

function judgeInput(): JudgeInput {
  return {
    goal: 'search for shoes',
    actionType: 'click',
    targetDescription: 'button[text="View Details"]',
    domContext: { tag: 'button', text: 'View Details', attributes: {}, nearbyText: '', formFieldNames: [] },
    recentHistory: [
      { actionType: 'fill', targetDescription: 'input#search', finalDecision: 'allowed', decisionSource: 'rule', ts: '2026-08-01T00:00:00Z' },
    ],
  };
}

describe('formatJudgePrompt', () => {
  it('includes the goal, action, target text, and history', () => {
    const prompt = formatJudgePrompt(judgeInput());
    expect(prompt).toContain('search for shoes');
    expect(prompt).toContain('click');
    expect(prompt).toContain('View Details');
    expect(prompt).toContain('input#search');
  });

  it('renders "(none)" when history is empty', () => {
    const input = judgeInput();
    input.recentHistory = [];
    const prompt = formatJudgePrompt(input);
    expect(prompt).toContain('(none)');
  });
});

describe('parseJudgeResponse', () => {
  it('parses a clean JSON verdict', () => {
    const result = parseJudgeResponse('{"verdict": "safe", "reason": "benign navigation"}');
    expect(result).toEqual({ verdict: 'safe', reason: 'benign navigation' });
  });

  it('extracts JSON embedded in surrounding prose', () => {
    const result = parseJudgeResponse('Here is my answer:\n{"verdict": "unsafe", "reason": "matches delete pattern"}\nThanks.');
    expect(result).toEqual({ verdict: 'unsafe', reason: 'matches delete pattern' });
  });

  it('throws on non-JSON responses', () => {
    expect(() => parseJudgeResponse('not json at all')).toThrow('not valid JSON');
  });

  it('throws when verdict is missing or invalid', () => {
    expect(() => parseJudgeResponse('{"verdict": "maybe", "reason": "unclear"}')).toThrow('missing valid verdict');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- judgePrompt.test.ts`
Expected: FAIL — `Cannot find module '../src/classifier/judgePrompt.js'`

- [ ] **Step 3: Create `src/classifier/judgePrompt.ts`**

```typescript
import type { JudgeInput, JudgeResult } from '../types.js';

export function formatJudgePrompt(input: JudgeInput): string {
  const historyLines =
    input.recentHistory
      .map((h) => `- ${h.actionType} on "${h.targetDescription}" -> ${h.finalDecision} (${h.decisionSource})`)
      .join('\n') || '(none)';

  return `You are a safety judge for a browser automation agent.

Stated goal: ${input.goal}

Current action: ${input.actionType} on element:
  tag: ${input.domContext.tag}
  text: "${input.domContext.text}"
  nearby text: "${input.domContext.nearbyText}"

Recent action history:
${historyLines}

Judge whether this action is safe to perform given the stated goal, or unsafe (destructive, irreversible, or inconsistent with the goal).

Respond with ONLY a JSON object, no other text: {"verdict": "safe" | "unsafe", "reason": "<one sentence>"}`;
}

export function parseJudgeResponse(raw: string): JudgeResult {
  let parsed: unknown;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    throw new Error(`Judge response was not valid JSON: ${raw}`);
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.verdict !== 'safe' && obj.verdict !== 'unsafe') {
    throw new Error(`Judge response missing valid verdict: ${raw}`);
  }

  return { verdict: obj.verdict, reason: typeof obj.reason === 'string' ? obj.reason : '' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- judgePrompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add browser-check/src/classifier/judgePrompt.ts browser-check/test/judgePrompt.test.ts
git commit -m "browser-check: add LLM judge prompt template and response parser"
```

---

### Task 5: Ollama Judge Provider

**Files:**
- Create: `browser-check/src/classifier/providers/ollama.ts`
- Test: `browser-check/test/ollamaProvider.test.ts`

**Interfaces:**
- Consumes: `LlmJudgeProvider`, `JudgeInput`, `JudgeResult` (Task 1); `formatJudgePrompt`, `parseJudgeResponse` (Task 4).
- Produces: `class OllamaJudgeProvider implements LlmJudgeProvider { constructor(options?: { baseUrl?: string; model?: string }) }` — consumed by Task 11 as the default provider.

- [ ] **Step 1: Write the failing test**

Create `browser-check/test/ollamaProvider.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaJudgeProvider } from '../src/classifier/providers/ollama.js';
import type { JudgeInput } from '../src/types.js';

function judgeInput(): JudgeInput {
  return {
    goal: 'search for shoes',
    actionType: 'click',
    targetDescription: 'button[text="View Details"]',
    domContext: { tag: 'button', text: 'View Details', attributes: {}, nearbyText: '', formFieldNames: [] },
    recentHistory: [],
  };
}

describe('OllamaJudgeProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('parses a verdict from the Ollama response body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: '{"verdict": "safe", "reason": "benign"}' }),
    }) as unknown as typeof fetch;

    const provider = new OllamaJudgeProvider();
    const result = await provider.judge(judgeInput());
    expect(result).toEqual({ verdict: 'safe', reason: 'benign' });
  });

  it('posts to the configured baseUrl and model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: '{"verdict": "safe", "reason": "ok"}' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new OllamaJudgeProvider({ baseUrl: 'http://localhost:9999', model: 'qwen2.5' });
    await provider.judge(judgeInput());

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/api/generate',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('qwen2.5');
  });

  it('throws when the Ollama request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' }) as unknown as typeof fetch;

    const provider = new OllamaJudgeProvider();
    await expect(provider.judge(judgeInput())).rejects.toThrow('Ollama request failed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ollamaProvider.test.ts`
Expected: FAIL — `Cannot find module '../src/classifier/providers/ollama.js'`

- [ ] **Step 3: Create `src/classifier/providers/ollama.ts`**

```typescript
import type { JudgeInput, JudgeResult, LlmJudgeProvider } from '../../types.js';
import { formatJudgePrompt, parseJudgeResponse } from '../judgePrompt.js';

export interface OllamaJudgeProviderOptions {
  baseUrl?: string;
  model?: string;
}

export class OllamaJudgeProvider implements LlmJudgeProvider {
  private baseUrl: string;
  private model: string;

  constructor(options: OllamaJudgeProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434';
    this.model = options.model ?? 'llama3.1';
  }

  async judge(input: JudgeInput): Promise<JudgeResult> {
    const prompt = formatJudgePrompt(input);
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { response: string };
    return parseJudgeResponse(data.response);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ollamaProvider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add browser-check/src/classifier/providers/ollama.ts browser-check/test/ollamaProvider.test.ts
git commit -m "browser-check: add Ollama judge provider"
```

---

### Task 6: Anthropic Judge Provider

**Files:**
- Create: `browser-check/src/classifier/providers/anthropic.ts`
- Test: `browser-check/test/anthropicProvider.test.ts`

**Interfaces:**
- Consumes: `LlmJudgeProvider`, `JudgeInput`, `JudgeResult` (Task 1); `formatJudgePrompt`, `parseJudgeResponse` (Task 4).
- Produces: `class AnthropicJudgeProvider implements LlmJudgeProvider { constructor(options?: { apiKey?: string; model?: string; client?: Anthropic }) }` — consumed by Task 11 as an optional provider swap-in.

- [ ] **Step 1: Write the failing test**

Create `browser-check/test/anthropicProvider.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AnthropicJudgeProvider } from '../src/classifier/providers/anthropic.js';
import type { JudgeInput } from '../src/types.js';

function judgeInput(): JudgeInput {
  return {
    goal: 'search for shoes',
    actionType: 'click',
    targetDescription: 'button[text="Delete Account"]',
    domContext: { tag: 'button', text: 'Delete Account', attributes: {}, nearbyText: '', formFieldNames: [] },
    recentHistory: [],
  };
}

function fakeClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: responseText }] }),
    },
  };
}

describe('AnthropicJudgeProvider', () => {
  it('parses a verdict from the text content block', async () => {
    const client = fakeClient('{"verdict": "unsafe", "reason": "matches destructive pattern"}');
    const provider = new AnthropicJudgeProvider({ apiKey: 'test-key', client: client as never });
    const result = await provider.judge(judgeInput());
    expect(result).toEqual({ verdict: 'unsafe', reason: 'matches destructive pattern' });
  });

  it('calls the client with the configured model', async () => {
    const client = fakeClient('{"verdict": "safe", "reason": "ok"}');
    const provider = new AnthropicJudgeProvider({ apiKey: 'test-key', model: 'claude-haiku-4-5-20251001', client: client as never });
    await provider.judge(judgeInput());
    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    );
  });

  it('throws when the response has no text block', async () => {
    const client = { messages: { create: vi.fn().mockResolvedValue({ content: [] }) } };
    const provider = new AnthropicJudgeProvider({ apiKey: 'test-key', client: client as never });
    await expect(provider.judge(judgeInput())).rejects.toThrow('no text block');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- anthropicProvider.test.ts`
Expected: FAIL — `Cannot find module '../src/classifier/providers/anthropic.js'`

- [ ] **Step 3: Create `src/classifier/providers/anthropic.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- anthropicProvider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add browser-check/src/classifier/providers/anthropic.ts browser-check/test/anthropicProvider.test.ts
git commit -m "browser-check: add Anthropic judge provider"
```

---

### Task 7: LLM Judge Orchestrator (fail-closed)

**Files:**
- Create: `browser-check/src/llmJudge.ts`
- Test: `browser-check/test/llmJudge.test.ts`

**Interfaces:**
- Consumes: `LlmJudgeProvider`, `JudgeInput`, `JudgeResult` (Task 1).
- Produces: `class LlmJudge { constructor(provider: LlmJudgeProvider); check(input: JudgeInput): Promise<JudgeResult> }` — consumed by Task 11. On provider failure, always resolves (never rejects) with `{ verdict: 'unsafe', reason: '...failing closed...' }`.

- [ ] **Step 1: Write the failing test**

Create `browser-check/test/llmJudge.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { LlmJudge } from '../src/llmJudge.js';
import type { JudgeInput, LlmJudgeProvider } from '../src/types.js';

function judgeInput(): JudgeInput {
  return {
    goal: 'search for shoes',
    actionType: 'click',
    targetDescription: 'button[text="View Details"]',
    domContext: { tag: 'button', text: 'View Details', attributes: {}, nearbyText: '', formFieldNames: [] },
    recentHistory: [],
  };
}

describe('LlmJudge', () => {
  it('returns the provider verdict when the provider succeeds', async () => {
    const provider: LlmJudgeProvider = { judge: vi.fn().mockResolvedValue({ verdict: 'safe', reason: 'benign navigation' }) };
    const judge = new LlmJudge(provider);
    const result = await judge.check(judgeInput());
    expect(result).toEqual({ verdict: 'safe', reason: 'benign navigation' });
  });

  it('fails closed to unsafe when the provider throws', async () => {
    const provider: LlmJudgeProvider = { judge: vi.fn().mockRejectedValue(new Error('connection refused')) };
    const judge = new LlmJudge(provider);
    const result = await judge.check(judgeInput());
    expect(result.verdict).toBe('unsafe');
    expect(result.reason).toContain('connection refused');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- llmJudge.test.ts`
Expected: FAIL — `Cannot find module '../src/llmJudge.js'`

- [ ] **Step 3: Create `src/llmJudge.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- llmJudge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add browser-check/src/llmJudge.ts browser-check/test/llmJudge.test.ts
git commit -m "browser-check: add fail-closed LLM judge orchestrator"
```

---

### Task 8: Session History

**Files:**
- Create: `browser-check/src/history.ts`
- Test: `browser-check/test/history.test.ts`

**Interfaces:**
- Consumes: `HistoryEntry` (Task 1).
- Produces: `class SessionHistory { constructor(maxSize?: number); add(entry: HistoryEntry): void; recent(): HistoryEntry[] }` — consumed by Task 11.

- [ ] **Step 1: Write the failing test**

Create `browser-check/test/history.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SessionHistory } from '../src/history.js';
import type { HistoryEntry } from '../src/types.js';

function entry(targetDescription: string, ts: string): HistoryEntry {
  return { actionType: 'click', targetDescription, finalDecision: 'allowed', decisionSource: 'rule', ts };
}

describe('SessionHistory', () => {
  it('returns entries in insertion order', () => {
    const history = new SessionHistory(10);
    history.add(entry('a', '2026-08-01T00:00:00Z'));
    history.add(entry('b', '2026-08-01T00:00:01Z'));
    expect(history.recent().map((e) => e.targetDescription)).toEqual(['a', 'b']);
  });

  it('drops the oldest entry once maxSize is exceeded', () => {
    const history = new SessionHistory(2);
    history.add(entry('a', '1'));
    history.add(entry('b', '2'));
    history.add(entry('c', '3'));
    expect(history.recent().map((e) => e.targetDescription)).toEqual(['b', 'c']);
  });

  it('defaults to a max size of 10', () => {
    const history = new SessionHistory();
    for (let i = 0; i < 15; i++) {
      history.add(entry(String(i), String(i)));
    }
    expect(history.recent()).toHaveLength(10);
    expect(history.recent()[0].targetDescription).toBe('5');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- history.test.ts`
Expected: FAIL — `Cannot find module '../src/history.js'`

- [ ] **Step 3: Create `src/history.ts`**

```typescript
import type { HistoryEntry } from './types.js';

export class SessionHistory {
  private entries: HistoryEntry[] = [];
  private maxSize: number;

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  add(entry: HistoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  recent(): HistoryEntry[] {
    return [...this.entries];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- history.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add browser-check/src/history.ts browser-check/test/history.test.ts
git commit -m "browser-check: add session history ring buffer"
```

---

### Task 9: Audit Log

**Files:**
- Create: `browser-check/src/auditLog.ts`
- Test: `browser-check/test/auditLog.test.ts`

**Interfaces:**
- Produces: `interface AuditLogEntry { ts, action, target, domContext, ruleVerdict, llmVerdict, finalDecision, decisionSource, reason }`, `class AuditLog { constructor(logPath?: string); write(entry: AuditLogEntry): Promise<void> }` — consumed by Task 11.

- [ ] **Step 1: Write the failing test**

Create `browser-check/test/auditLog.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auditLog.test.ts`
Expected: FAIL — `Cannot find module '../src/auditLog.js'`

- [ ] **Step 3: Create `src/auditLog.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- auditLog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add browser-check/src/auditLog.ts browser-check/test/auditLog.test.ts
git commit -m "browser-check: add JSONL audit log writer"
```

---

### Task 10: CLI Escalation Handler

**Files:**
- Create: `browser-check/src/escalation/cliHandler.ts`
- Test: `browser-check/test/cliHandler.test.ts`

**Interfaces:**
- Produces: `interface EscalationInput { actionType, targetDescription, reason }`, `interface EscalationHandler { escalate(input: EscalationInput): Promise<boolean> }`, `class CliEscalationHandler implements EscalationHandler { constructor(askFn?: (prompt: string) => Promise<string>) }` — consumed by Task 11.

- [ ] **Step 1: Write the failing test**

Create `browser-check/test/cliHandler.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cliHandler.test.ts`
Expected: FAIL — `Cannot find module '../src/escalation/cliHandler.js'`

- [ ] **Step 3: Create `src/escalation/cliHandler.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cliHandler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add browser-check/src/escalation/cliHandler.ts browser-check/test/cliHandler.test.ts
git commit -m "browser-check: add CLI escalation handler"
```

---

### Task 11: BrowserCheckSession

**Files:**
- Create: `browser-check/src/session.ts`
- Test: `browser-check/test/session.test.ts`

**Interfaces:**
- Consumes: `RuleClassifier` (Task 3), `LlmJudge` (Task 7), `OllamaJudgeProvider` (Task 5), `SessionHistory` (Task 8), `AuditLog` (Task 9), `CliEscalationHandler`/`EscalationHandler` (Task 10), `captureDomContext` (Task 2), `ActionBlockedError` (Task 1), `ActionType`/`DomContext`/`LlmJudgeProvider`/`RuleDefinition` (Task 1).
- Produces: `interface BrowserCheckSessionOptions { page, goal, logPath?, llmJudgeProvider?, rules?, escalationHandler?, historySize? }`, `class BrowserCheckSession` with methods `click`, `fill`, `goto`, `press`, `check`, `uncheck`, `selectOption`, `setInputFiles` (all `Promise<void>`, throwing `ActionBlockedError` when blocked) — consumed by Task 12.

- [ ] **Step 1: Write the failing test**

Create `browser-check/test/session.test.ts` — uses fake collaborators (no real Playwright, no real classifier) to test the orchestration logic in isolation:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- session.test.ts`
Expected: FAIL — `Cannot find module '../src/session.js'`

- [ ] **Step 3: Create `src/session.ts`**

```typescript
import type { Page, Locator } from 'playwright';
import { RuleClassifier } from './classifier/rules.js';
import { LlmJudge } from './llmJudge.js';
import { OllamaJudgeProvider } from './classifier/providers/ollama.js';
import { SessionHistory } from './history.js';
import { AuditLog } from './auditLog.js';
import { CliEscalationHandler, type EscalationHandler } from './escalation/cliHandler.js';
import { captureDomContext } from './domContext.js';
import { ActionBlockedError } from './errors.js';
import type { ActionType, DomContext, LlmJudgeProvider, RuleDefinition, Verdict } from './types.js';

export interface BrowserCheckSessionOptions {
  page: Page;
  goal: string;
  logPath?: string;
  llmJudgeProvider?: LlmJudgeProvider;
  rules?: RuleDefinition[];
  escalationHandler?: EscalationHandler;
  historySize?: number;
}

export class BrowserCheckSession {
  private page: Page;
  private goal: string;
  private classifier: RuleClassifier;
  private judge: LlmJudge;
  private history: SessionHistory;
  private auditLog: AuditLog;
  private escalationHandler: EscalationHandler;

  constructor(options: BrowserCheckSessionOptions) {
    this.page = options.page;
    this.goal = options.goal;
    this.classifier = new RuleClassifier(options.rules ?? []);
    this.judge = new LlmJudge(options.llmJudgeProvider ?? new OllamaJudgeProvider());
    this.history = new SessionHistory(options.historySize ?? 10);
    this.auditLog = new AuditLog(options.logPath ?? './browser-check.log.jsonl');
    this.escalationHandler = options.escalationHandler ?? new CliEscalationHandler();
  }

  async click(locator: Locator): Promise<void> {
    await this.verifyAndRun('click', locator, () => locator.click());
  }

  async fill(locator: Locator, value: string): Promise<void> {
    await this.verifyAndRun('fill', locator, () => locator.fill(value));
  }

  async goto(url: string): Promise<void> {
    const domContext: DomContext = { tag: 'a', text: url, attributes: { href: url }, nearbyText: '', formFieldNames: [] };
    await this.verifyAndRunWithContext('goto', domContext, url, () => this.page.goto(url));
  }

  async press(locator: Locator, key: string): Promise<void> {
    await this.verifyAndRun('press', locator, () => locator.press(key));
  }

  async check(locator: Locator): Promise<void> {
    await this.verifyAndRun('check', locator, () => locator.check());
  }

  async uncheck(locator: Locator): Promise<void> {
    await this.verifyAndRun('uncheck', locator, () => locator.uncheck());
  }

  async selectOption(locator: Locator, value: string): Promise<void> {
    await this.verifyAndRun('selectOption', locator, () => locator.selectOption(value));
  }

  async setInputFiles(locator: Locator, filePath: string): Promise<void> {
    await this.verifyAndRun('setInputFiles', locator, () => locator.setInputFiles(filePath));
  }

  private async verifyAndRun(actionType: ActionType, locator: Locator, run: () => Promise<unknown>): Promise<void> {
    const domContext = await captureDomContext(locator);
    const targetDescription = `${domContext.tag}[text="${domContext.text.slice(0, 50)}"]`;
    await this.verifyAndRunWithContext(actionType, domContext, targetDescription, run);
  }

  private async verifyAndRunWithContext(
    actionType: ActionType,
    domContext: DomContext,
    targetDescription: string,
    run: () => Promise<unknown>
  ): Promise<void> {
    const ruleVerdict: Verdict = this.classifier.check({ actionType, domContext, goal: this.goal });

    let finalVerdict: Verdict = ruleVerdict;
    let llmVerdict: string | null = null;
    let reason = `matched rule pass: ${ruleVerdict}`;

    if (ruleVerdict === 'ambiguous') {
      const judgeResult = await this.judge.check({
        goal: this.goal,
        actionType,
        targetDescription,
        domContext,
        recentHistory: this.history.recent(),
      });
      llmVerdict = judgeResult.verdict;
      finalVerdict = judgeResult.verdict;
      reason = judgeResult.reason;
    }

    let finalDecision: 'allowed' | 'blocked';
    let decisionSource: 'rule' | 'llm' | 'human';

    if (finalVerdict === 'safe') {
      finalDecision = 'allowed';
      decisionSource = ruleVerdict === 'safe' ? 'rule' : 'llm';
    } else {
      const approved = await this.escalationHandler.escalate({ actionType, targetDescription, reason });
      finalDecision = approved ? 'allowed' : 'blocked';
      decisionSource = 'human';
    }

    await this.auditLog.write({
      ts: new Date().toISOString(),
      action: actionType,
      target: targetDescription,
      domContext,
      ruleVerdict,
      llmVerdict,
      finalDecision,
      decisionSource,
      reason,
    });

    this.history.add({ actionType, targetDescription, finalDecision, decisionSource, ts: new Date().toISOString() });

    if (finalDecision === 'blocked') {
      throw new ActionBlockedError(actionType, targetDescription, reason);
    }

    await run();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- session.test.ts`
Expected: PASS

- [ ] **Step 5: Clean up stray audit log files created by the test run**

Run: `rm -f browser-check/test-session-audit.log.jsonl`

- [ ] **Step 6: Commit**

```bash
git add browser-check/src/session.ts browser-check/test/session.test.ts
git commit -m "browser-check: add BrowserCheckSession orchestrator"
```

---

### Task 12: Public Exports & Real-Playwright Integration Test

**Files:**
- Create: `browser-check/src/index.ts`
- Create: `browser-check/test/fixtures/test-page.html`
- Test: `browser-check/test/session.integration.test.ts`

**Interfaces:**
- Consumes: everything produced in Tasks 1–11.
- Produces: the package's public entry point (`browser-check/src/index.ts`, referenced by `main`/`types` in `package.json`).

- [ ] **Step 1: Create the HTML fixture**

Create `browser-check/test/fixtures/test-page.html`:

```html
<!DOCTYPE html>
<html>
<head><title>browser-check test fixture</title></head>
<body>
  <input id="search" name="search" type="text" placeholder="Search" />
  <button id="search-btn">Search</button>
  <button id="delete-btn">Delete Account</button>
</body>
</html>
```

- [ ] **Step 2: Write the failing integration test**

Create `browser-check/test/session.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'node:url';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { BrowserCheckSession, ActionBlockedError, type EscalationHandler } from '../src/index.js';

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'test-page.html');
const logPath = path.join(path.dirname(fixturePath), 'integration-audit.log.jsonl');

class AutoDenyHandler implements EscalationHandler {
  async escalate(): Promise<boolean> {
    return false;
  }
}

describe('BrowserCheckSession integration', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  afterEach(async () => {
    await page.close();
    await unlink(logPath).catch(() => {});
  });

  it('auto-allows a safe fill action end to end', async () => {
    page = await browser.newPage();
    await page.goto(`file://${fixturePath}`);
    const session = new BrowserCheckSession({
      page,
      goal: 'search for a product',
      logPath,
      escalationHandler: new AutoDenyHandler(),
    });

    await session.fill(page.locator('#search'), 'shoes');
    await expect(page.locator('#search')).toHaveValue('shoes');
  });

  it('escalates and blocks a destructive click when the human denies', async () => {
    page = await browser.newPage();
    await page.goto(`file://${fixturePath}`);
    const session = new BrowserCheckSession({
      page,
      goal: 'search for a product',
      logPath,
      escalationHandler: new AutoDenyHandler(),
    });

    await expect(session.click(page.locator('#delete-btn'))).rejects.toThrow(ActionBlockedError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- session.integration.test.ts`
Expected: FAIL — `Cannot find module '../src/index.js'`

- [ ] **Step 4: Create `src/index.ts`**

```typescript
export { BrowserCheckSession } from './session.js';
export type { BrowserCheckSessionOptions } from './session.js';

export { ActionBlockedError } from './errors.js';

export { RuleClassifier, builtInRules } from './classifier/rules.js';
export { OllamaJudgeProvider } from './classifier/providers/ollama.js';
export type { OllamaJudgeProviderOptions } from './classifier/providers/ollama.js';
export { AnthropicJudgeProvider } from './classifier/providers/anthropic.js';
export type { AnthropicJudgeProviderOptions } from './classifier/providers/anthropic.js';

export { CliEscalationHandler } from './escalation/cliHandler.js';
export type { EscalationHandler, EscalationInput } from './escalation/cliHandler.js';

export type {
  ActionType,
  DomContext,
  Verdict,
  RuleDefinition,
  HistoryEntry,
  JudgeInput,
  JudgeResult,
  LlmJudgeProvider,
} from './types.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- session.integration.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full test suite**

Run: `cd browser-check && npm test`
Expected: PASS — all suites green (rules, judgePrompt, ollamaProvider, anthropicProvider, llmJudge, history, auditLog, cliHandler, domContext, session, session.integration).

- [ ] **Step 7: Run the TypeScript build**

Run: `cd browser-check && npm run build`
Expected: compiles cleanly to `dist/` with no type errors.

- [ ] **Step 8: Commit**

```bash
git add browser-check/src/index.ts browser-check/test/fixtures/test-page.html browser-check/test/session.integration.test.ts
git commit -m "browser-check: add public exports and end-to-end Playwright integration test"
```
