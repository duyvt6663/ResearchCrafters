/**
 * Mentor refusal copy.
 *
 * Per `backlog/05-mentor-safety.md`, refusals must be authored — never produced
 * by the model itself. This module exposes default platform-wide copy and a
 * `mentorRefusal({ scope, packageTitle })` helper that picks the right line
 * for the refusal scope. Per-package overrides live alongside the package
 * content, not in this module.
 */

export type MentorRefusalScope =
  | "solution_request"
  | "out_of_context"
  | "rate_limit"
  | "budget_cap"
  | "policy_block"
  | "flagged_output";

export interface MentorRefusalArgs {
  scope: MentorRefusalScope;
  packageTitle?: string;
}

export interface MentorRefusalCopy {
  scope: MentorRefusalScope;
  title: string;
  body: string;
  hint: string;
}

const REFUSALS: Record<
  MentorRefusalScope,
  (packageTitle: string) => MentorRefusalCopy
> = {
  solution_request: (pkg) => ({
    scope: "solution_request",
    title: "I cannot reveal the answer here.",
    body: `Mentor guidance for ${pkg} avoids spoiling the decision you are about to make. Try the hint or clarify modes instead.`,
    hint: "Switch to Hint mode for a smaller nudge.",
  }),
  out_of_context: (pkg) => ({
    scope: "out_of_context",
    title: "That request is outside this stage's policy.",
    body: `Only the evidence and rubric for the current stage of ${pkg} are in scope. Other artifacts will not be referenced here.`,
    hint: "Open the Evidence tab to see what is in scope.",
  }),
  rate_limit: () => ({
    scope: "rate_limit",
    title: "Mentor rate limit reached.",
    body: "You have used the allowed mentor messages for this window. The limit resets shortly; your draft is preserved.",
    hint: "Keep drafting; the timer resets in a few minutes.",
  }),
  budget_cap: () => ({
    scope: "budget_cap",
    title: "Mentor budget cap reached.",
    body: "Your mentor budget for this session is used up. New messages are paused until the next cycle.",
    hint: "Review feedback you already received while you wait.",
  }),
  policy_block: (pkg) => ({
    scope: "policy_block",
    title: "Policy blocked this mentor request.",
    body: `That request was blocked by ${pkg}'s safety policy. The block is intentional and not a model error.`,
    hint: "Try rephrasing in terms of evidence or rubric criteria.",
  }),
  flagged_output: () => ({
    scope: "flagged_output",
    title: "Mentor output was held back.",
    body: "The model's draft response was flagged by safety guardrails and was not delivered. No partial answer is shown.",
    hint: "Try a narrower question grounded in the evidence panel.",
  }),
};

export function mentorRefusal(args: MentorRefusalArgs): MentorRefusalCopy {
  const builder = REFUSALS[args.scope];
  return builder(args.packageTitle ?? "this package");
}

export const mentorRefusalDefaults = {
  solution: () => mentorRefusal({ scope: "solution_request" }),
  outOfContext: () => mentorRefusal({ scope: "out_of_context" }),
  rateLimit: () => mentorRefusal({ scope: "rate_limit" }),
  budgetCap: () => mentorRefusal({ scope: "budget_cap" }),
  policyBlock: () => mentorRefusal({ scope: "policy_block" }),
  flaggedOutput: () => mentorRefusal({ scope: "flagged_output" }),
} as const;
