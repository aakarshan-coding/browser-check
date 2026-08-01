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
