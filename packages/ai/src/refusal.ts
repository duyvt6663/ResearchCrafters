/**
 * Authored refusal copy.
 *
 * IMPORTANT: The strings here are PLACEHOLDERS. The real, package-aware
 * authored copy lives in `@researchcrafters/ui/copy` (see TODOS/05 and
 * TODOS/09). The product surface MUST resolve refusal strings via that
 * package; this file exists only so the runtime has a typed default while the
 * UI package is being wired up.
 *
 * Do NOT let the LLM author refusals — that defeats the whole point of having
 * package-controlled, audited refusal language.
 */

export type RefusalReason =
  | 'visibility_blocked'
  | 'budget_exceeded'
  | 'rate_limited'
  | 'redaction_triggered'
  | 'leak_test_failed';

interface Refusal {
  reason: RefusalReason;
  /** Short title shown in the chat bubble. */
  title: string;
  /** Body shown to the learner. */
  body: string;
}

const PLACEHOLDER_COPY: Readonly<Record<RefusalReason, Refusal>> = {
  visibility_blocked: {
    reason: 'visibility_blocked',
    title: 'Not yet',
    body: 'I can help with this stage, but I can\'t reveal that material until later in the package. Try working through the current task first.',
  },
  budget_exceeded: {
    reason: 'budget_exceeded',
    title: 'Mentor budget reached',
    body: 'You\'ve reached today\'s mentor budget on this package. Try again tomorrow, or use the rubric and hints to make progress.',
  },
  rate_limited: {
    reason: 'rate_limited',
    title: 'Slow down',
    body: 'You\'re asking faster than the mentor can keep up. Wait a moment, then try again.',
  },
  redaction_triggered: {
    reason: 'redaction_triggered',
    title: 'Response blocked',
    body: 'The mentor produced text that included restricted content. The response was blocked. Please rephrase your question.',
  },
  leak_test_failed: {
    reason: 'leak_test_failed',
    title: 'Mentor disabled',
    body: 'The mentor is temporarily disabled on this stage while we review its safety configuration.',
  },
};

export function getAuthoredRefusal(reason: RefusalReason): Refusal {
  return PLACEHOLDER_COPY[reason];
}
