export class StudyRuleError extends Error {}
export function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new StudyRuleError(message);
}
