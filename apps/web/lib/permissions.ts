// Single access-policy surface. Every API route MUST call this before
// returning data, per docs/TECHNICAL.md §10 and TODOS/06 access policy.

import type { Session } from "./auth.js";

export type PermissionAction =
  | "view_stage"
  | "submit_attempt"
  | "request_mentor_hint"
  | "request_mentor_feedback"
  | "view_branch_feedback"
  | "create_share_card"
  | "view_solution";

export type PermissionInput = {
  user: Session;
  packageVersionId: string;
  // Stage descriptor. The real shape comes from @researchcrafters/erp-schema;
  // we type it loosely here to keep the stub call sites honest.
  stage: {
    ref: string;
    isFreePreview: boolean;
    isLocked: boolean;
  };
  action: PermissionAction;
};

export type PermissionResult =
  | { allowed: true }
  | { allowed: false; reason: PermissionDenialReason };

export type PermissionDenialReason =
  | "not_authenticated"
  | "stage_locked"
  | "no_entitlement"
  | "no_membership"
  | "policy_disallows";

function isFreeAction(action: PermissionAction): boolean {
  // view_stage on a free-preview stage is the only purely-free path; mentor,
  // submission, branch feedback, share card, and solution are gated.
  return action === "view_stage";
}

export const permissions = {
  canAccess(input: PermissionInput): PermissionResult {
    const { user, stage, action } = input;

    // Authenticated check: most actions require a user. view_stage on a free
    // preview stage is allowed for visitors so the catalog -> overview ->
    // first-decision flow does not trip a paywall before the user has any
    // chance to try the product.
    if (!user.userId) {
      if (action === "view_stage" && stage.isFreePreview && !stage.isLocked) {
        return { allowed: true };
      }
      return { allowed: false, reason: "not_authenticated" };
    }

    // Stage locked at the package level — no action proceeds.
    if (stage.isLocked && action !== "view_stage") {
      return { allowed: false, reason: "stage_locked" };
    }

    // Free preview stages: view_stage and submit_attempt allowed without
    // entitlement; mentor and solution paths still gated.
    if (stage.isFreePreview) {
      if (action === "view_stage" || action === "submit_attempt") {
        return { allowed: true };
      }
    }

    // Stub entitlement: a hypothetical "u-paid" user has full access; a
    // "u-stub" user has free-preview-only. Real impl will read memberships +
    // entitlements + release.free_stages from the DB.
    if (user.userId === "u-paid") {
      return { allowed: true };
    }

    if (isFreeAction(action) && !stage.isLocked) {
      return { allowed: true };
    }

    return { allowed: false, reason: "no_entitlement" };
  },
};

export function denialHttpStatus(reason: PermissionDenialReason): number {
  switch (reason) {
    case "not_authenticated":
      return 401;
    case "stage_locked":
    case "no_entitlement":
    case "no_membership":
    case "policy_disallows":
      return 403;
    default:
      return 403;
  }
}
