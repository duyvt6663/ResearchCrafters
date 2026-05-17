/**
 * Authored mentor-refusal copy resolver.
 *
 * Per `backlog/05-mentor-safety.md` — "Author refusal copy per package; do not
 * let the model generate refusals." Refusal strings shown to the learner are
 * authored content, never produced by the LLM. This module is the single
 * server-side resolver: it merges platform defaults with the per-package
 * authored copy (declared under `package.safety.mentor_refusals`).
 *
 * Resolution precedence (highest first):
 *   1. Per-package authored override for the requested scope.
 *   2. Platform default for the scope.
 *
 * The defaults below are deliberately kept in lock-step with the React-free
 * authored copy shipped in `@researchcrafters/ui/copy` (mentor-refusal.ts).
 * The `parity-with-ui` test in `packages/ai/test/refusal.test.ts` fails
 * loudly if they ever drift.
 */

import type { MentorRefusals } from '@researchcrafters/erp-schema';

export type MentorRefusalScope =
  | 'solution_request'
  | 'out_of_context'
  | 'rate_limit'
  | 'budget_cap'
  | 'policy_block'
  | 'flagged_output';

export interface AuthoredRefusal {
  scope: MentorRefusalScope;
  title: string;
  body: string;
  hint: string;
}

export interface GetAuthoredRefusalInput {
  scope: MentorRefusalScope;
  /**
   * Optional package title used to personalise the platform defaults
   * ("Mentor guidance for ${packageTitle} ..."). Per-package overrides
   * declared by the author take precedence and are returned verbatim.
   */
  packageTitle?: string;
  /**
   * Per-package authored copy, sourced from `package.safety.mentor_refusals`
   * in the package YAML. Any scope the package omits falls back to the
   * platform default.
   */
  authoredOverrides?: MentorRefusals;
}

type DefaultBuilder = (packageTitle: string) => AuthoredRefusal;

const DEFAULTS: Readonly<Record<MentorRefusalScope, DefaultBuilder>> = {
  solution_request: (pkg) => ({
    scope: 'solution_request',
    title: 'I cannot reveal the answer here.',
    body: `Mentor guidance for ${pkg} avoids spoiling the decision you are about to make. Try the hint or clarify modes instead.`,
    hint: 'Switch to Hint mode for a smaller nudge.',
  }),
  out_of_context: (pkg) => ({
    scope: 'out_of_context',
    title: "That request is outside this stage's policy.",
    body: `Only the evidence and rubric for the current stage of ${pkg} are in scope. Other artifacts will not be referenced here.`,
    hint: 'Open the Evidence tab to see what is in scope.',
  }),
  rate_limit: () => ({
    scope: 'rate_limit',
    title: 'Mentor rate limit reached.',
    body: 'You have used the allowed mentor messages for this window. The limit resets shortly; your draft is preserved.',
    hint: 'Keep drafting; the timer resets in a few minutes.',
  }),
  budget_cap: () => ({
    scope: 'budget_cap',
    title: 'Mentor budget cap reached.',
    body: 'Your mentor budget for this session is used up. New messages are paused until the next cycle.',
    hint: 'Review feedback you already received while you wait.',
  }),
  policy_block: (pkg) => ({
    scope: 'policy_block',
    title: 'Policy blocked this mentor request.',
    body: `That request was blocked by ${pkg}'s safety policy. The block is intentional and not a model error.`,
    hint: 'Try rephrasing in terms of evidence or rubric criteria.',
  }),
  flagged_output: () => ({
    scope: 'flagged_output',
    title: 'Mentor output was held back.',
    body: "The model's draft response was flagged by safety guardrails and was not delivered. No partial answer is shown.",
    hint: 'Try a narrower question grounded in the evidence panel.',
  }),
};

const ALL_SCOPES: ReadonlyArray<MentorRefusalScope> = [
  'solution_request',
  'out_of_context',
  'rate_limit',
  'budget_cap',
  'policy_block',
  'flagged_output',
];

/**
 * Resolve the authored refusal copy for `scope`. Per-package overrides win
 * over platform defaults; the LLM is never consulted. The returned object is
 * safe to render verbatim — no further interpolation is needed.
 */
export function getAuthoredRefusal(
  input: GetAuthoredRefusalInput,
): AuthoredRefusal {
  const pkgTitle = input.packageTitle?.trim() || 'this package';
  const override = input.authoredOverrides?.[input.scope];
  if (override) {
    return {
      scope: input.scope,
      title: override.title,
      body: override.body,
      hint: override.hint ?? DEFAULTS[input.scope](pkgTitle).hint,
    };
  }
  return DEFAULTS[input.scope](pkgTitle);
}

/**
 * Return the platform-default copy for every scope, personalised with the
 * provided package title. Exposed for tests and tooling that need to render
 * a full preview of authored refusals.
 */
export function platformDefaultRefusals(
  packageTitle: string = 'this package',
): Record<MentorRefusalScope, AuthoredRefusal> {
  const out = {} as Record<MentorRefusalScope, AuthoredRefusal>;
  for (const scope of ALL_SCOPES) {
    out[scope] = DEFAULTS[scope](packageTitle);
  }
  return out;
}

export const MENTOR_REFUSAL_SCOPES = ALL_SCOPES;
