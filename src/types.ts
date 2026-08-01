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
