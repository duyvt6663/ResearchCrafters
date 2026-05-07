/**
 * Paywall copy variants. Authored — never LLM-generated.
 *
 * Variants follow `docs/FRONTEND.md` section 13: surface paywalls only at
 * natural boundaries (after preview stages, before submit on locked stage,
 * before mentor request without entitlement). Never interrupt mid-attempt.
 */

export interface PaywallCopyArgs {
  packageTitle?: string;
  unlocks?: string[];
}

export interface PaywallCopy {
  title: string;
  body: string;
  bullets: string[];
  primaryCta: string;
  secondaryCta: string;
}

const DEFAULT_UNLOCKS = [
  "Full package access from the next stage onward",
  "Mentor feedback when included in your plan",
  "Run history and shareable result cards",
  "Your current progress is preserved",
];

function unlocksFor(args: PaywallCopyArgs | undefined): string[] {
  return args?.unlocks && args.unlocks.length > 0
    ? args.unlocks
    : DEFAULT_UNLOCKS;
}

function pkg(args: PaywallCopyArgs | undefined): string {
  return args?.packageTitle ?? "this package";
}

export function previewBoundary(args?: PaywallCopyArgs): PaywallCopy {
  return {
    title: "You finished the preview.",
    body: `The preview stages of ${pkg(args)} are complete. Unlock the full package to keep going from where you left off.`,
    bullets: unlocksFor(args),
    primaryCta: "Unlock full access",
    secondaryCta: "Back to package overview",
  };
}

export function lockedStage(args?: PaywallCopyArgs): PaywallCopy {
  return {
    title: "This stage is locked.",
    body: `Submitting this stage of ${pkg(args)} requires full access. Your draft and progress are saved either way.`,
    bullets: unlocksFor(args),
    primaryCta: "Unlock to submit",
    secondaryCta: "Keep drafting",
  };
}

export function mentorWithoutEntitlement(args?: PaywallCopyArgs): PaywallCopy {
  return {
    title: "Mentor feedback is not in your current plan.",
    body: `Mentor sessions for ${pkg(args)} are part of the full plan. You can keep working without it; nothing in your draft is lost.`,
    bullets: [
      "Hint, clarify, review-draft, and explain-branch modes",
      "Stage-aware context with safety rails",
      "Authored refusal copy when a request is out of policy",
      "Your draft and run history are preserved",
    ],
    primaryCta: "Add mentor feedback",
    secondaryCta: "Continue without mentor",
  };
}

export const paywall = {
  previewBoundary,
  lockedStage,
  mentorWithoutEntitlement,
} as const;

export type PaywallVariant = keyof typeof paywall;
