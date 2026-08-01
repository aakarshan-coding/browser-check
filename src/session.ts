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
