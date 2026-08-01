# browser-check: Design Spec

**Date:** 2026-08-01
**Status:** Approved for implementation planning

## Purpose

`browser-check` provides intent verification for computer-using agents that drive a web browser. It sits between an agent's decision to take an action and the action actually executing, checking each action against the agent's stated goal, and blocking or escalating actions that look unsafe or destructive.

## Scope (v1)

- TypeScript/Node library, integrated as an SDK (not a proxy service, not a browser extension).
- Wraps Playwright's `Page` API. Browser automation actions only — no OS-level/computer-use action support in v1.
- Two-tier decision model: **safe** (auto-allow) or **unsafe** (escalate to a human). No hard-block tier that bypasses human override.

## Architecture

The agent constructs a `BrowserCheckSession` by wrapping a Playwright `Page` and providing a stated goal string for the session. The agent calls session methods (`click`, `fill`, `goto`, `press`, `check`, `selectOption`, `setInputFiles`, etc.) instead of calling the `Page` directly. Each call runs through **classify → decide → act**, then logs the outcome.

```
Agent code
   |  session.click(locator)
   v
BrowserCheckSession
   |  1. capture DOM context around target
   |  2. run rule-based classifier
   |  3. if ambiguous -> LLM judge (goal + DOM + recent history)
   |  4. if unsafe -> CLI prompt, block on human y/n
   |  5. log decision (JSONL)
   v
Real Playwright Page method (if allowed)
```

## Components

- **`BrowserCheckSession`** — public API. Constructed with `{ page, goal, logPath?, llmJudgeProvider?, rules? }`. Exposes wrapped action methods; each returns the same result the underlying Playwright call would, or throws `ActionBlockedError` if the human denies.
- **`RuleClassifier`** — pattern-matches DOM context (button/link text, form field names, nearby text) against a built-in destructive-signal list plus caller-supplied `RuleDefinition[]`. Outputs `safe`, `unsafe`, or `ambiguous`. Synchronous, no network call.
- **`LlmJudge`** — invoked only when the rule pass returns `ambiguous`. Sends the stated goal, current action + DOM context, and recent action history to a pluggable `LlmJudgeProvider`, gets back `{ verdict: 'safe' | 'unsafe', reason }`.
- **`LlmJudgeProvider`** interface — pluggable judge backend.
  - `OllamaJudgeProvider` (default): calls a local Ollama instance (`localhost:11434`), model configurable (e.g. `llama3.1`, `qwen2.5`). No API key required out of the box.
  - `AnthropicJudgeProvider` (built-in alternative): calls Claude via the Anthropic SDK, for callers who want higher-accuracy judging via API. API key from `ANTHROPIC_API_KEY`.
- **`EscalationHandler`** — CLI implementation (v1 default): prints the action, DOM context, and judge's reason; blocks on stdin for y/n.
- **`AuditLog`** — appends one JSON line per action to a log file (default `./browser-check.log.jsonl`, path configurable).
- **`SessionHistory`** — in-memory ring buffer of the last N actions + decisions, fed to the LLM judge for pattern/drift context.

## Data Flow — One Action, Step by Step

1. Agent calls `session.click(locator)`.
2. Session resolves the Playwright `Locator`, captures DOM context: element text, tag, attributes (`type`, `name`, `href`), and text of nearby siblings/parent.
3. `RuleClassifier.check({ actionType, domContext, goal })` runs first.
   - Confident destructive match (e.g. element text contains "Delete Account", "Confirm Purchase"; or element is inside a payment-shaped form) → `unsafe`.
   - Confident benign match (e.g. `fill` into a search box, no matched signals) → `safe`.
   - Neither → `ambiguous`.
4. If `ambiguous`, `LlmJudge.check({ goal, action, domContext, recentHistory })` calls the configured provider, returns `{ verdict, reason }`.
5. If final verdict is `safe` → action executes immediately, logged as `allowed (rule)` or `allowed (llm)`.
6. If `unsafe` → `EscalationHandler.escalate({ action, domContext, reason })` prints to console and blocks on stdin.
   - `y` → action executes, logged as `allowed (human-override)`.
   - `n` → action is skipped, `ActionBlockedError` thrown back to agent code, logged as `blocked (human)`.
7. Every outcome is appended to `SessionHistory` and written to the audit log, regardless of path taken.

## Classifier Details

**Rule set (v1, built-in + extensible):**
- Destructive keywords in target/nearby text: `delete`, `remove`, `cancel account`, `deactivate`, `confirm purchase`, `place order`, `submit payment`.
- Payment-shaped forms: fields named/typed like `card-number`, `cvv`, `card-expiry`, or a submit button inside a `<form>` containing such fields.
- File downloads / `setInputFiles` outside the stated goal's domain.
- Callers may pass additional `RuleDefinition[]` (a test function over `domContext` → verdict) at session construction — no fork required for domain-specific rules.

**LLM judge prompt:** stated goal, action type + target description, DOM context snippet, last N history entries (action + verdict). Requires a strict JSON response: `{ verdict: 'safe' | 'unsafe', reason: string }`.

## Audit Log Format

JSON Lines, one entry per action:

```json
{"ts":"2026-08-01T14:32:10Z","action":"click","target":"button[text=Confirm Purchase]","domContext":"...","ruleVerdict":"unsafe","llmVerdict":null,"finalDecision":"blocked","decisionSource":"human","reason":"matched rule: payment-confirm"}
```

`decisionSource` is one of `rule`, `llm`, or `human`. Escalated entries include the human's y/n and any reason the LLM judge supplied.

## Error Handling

- Human denies → `ActionBlockedError` thrown to agent code. The agent decides whether to retry, replan, or abort — `browser-check` does not make that call.
- LLM judge provider unreachable or errors (e.g. Ollama not running) → **fail closed**: treated as `unsafe`, escalated to the human with a note that the judge failed. Never silently allowed.
- Malformed/non-JSON LLM response → same fail-closed treatment.

## Testing Strategy

- Unit tests for `RuleClassifier` against a fixture table of known-safe, known-unsafe, and ambiguous DOM contexts.
- Unit tests for `LlmJudge` with a mocked `LlmJudgeProvider` — no real Ollama call in CI.
- Integration test: a local static HTML fixture page (a safe form + a "Delete Account" button) driven via real Playwright + a real `BrowserCheckSession`, asserting the safe path auto-allows and the unsafe path escalates (with `EscalationHandler` mocked to auto-answer).
- No live LLM calls in the default test suite — provider is always mocked/stubbed.

## Out of Scope (v1)

- OS-level/computer-use actions (mouse/keyboard/shell) beyond the browser.
- Non-CLI escalation channels (dashboard, Slack, webhook) — the `EscalationHandler` is a fixed CLI implementation for v1, not yet pluggable.
- Hard-block tier with no human override.
- Puppeteer/CDP-level support.
