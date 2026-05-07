/**
 * Stage-locked copy. Used when a learner navigates to a stage they cannot
 * yet open. Surface the unlock rule plainly; do not reveal stage content.
 */

export interface StageLockedCopy {
  title: string;
  body: string;
  ruleLabel: string;
  cta: string;
}

export interface StageLockedArgs {
  /** Human-readable description of the unlock rule, e.g. "Complete stage 4". */
  rule?: string;
}

export function stageLocked(args?: StageLockedArgs): StageLockedCopy {
  return {
    title: "This stage is locked.",
    body: "You will be able to open it once the unlock rule is met. The rule does not reveal the contents of this stage.",
    ruleLabel: args?.rule ?? "Unlock rule not yet met.",
    cta: "Back to current stage",
  };
}
