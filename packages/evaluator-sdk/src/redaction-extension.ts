import { redact } from '@researchcrafters/ai';
import type { RedactionResult } from '@researchcrafters/ai';

/**
 * Wraps `ai.redact` so any mentor message that quotes evaluator output goes
 * through the same redaction pass. Per TODOS/04 #LLM-grading: leaked text must
 * not escape through the mentor channel either.
 *
 * Mentor messages can include block quotes from grader output. This helper
 * returns the redacted message AND a flag the web app sets on the
 * `mentor_messages` row.
 */
export interface RedactedMentorMessage {
  text: string;
  redactionTriggered: boolean;
  matchedTargets: string[];
}

export function redactEvaluatorQuotes(
  text: string,
  redactionTargets: ReadonlyArray<string>,
): RedactedMentorMessage {
  const result: RedactionResult = redact(text, redactionTargets);
  return {
    text: result.text,
    redactionTriggered: result.triggered,
    matchedTargets: result.matchedTargets,
  };
}
