// Single access-policy surface. Every API route MUST call this before
// returning data, per docs/TECHNICAL.md §10 and TODOS/06 access policy.
//
// Implementation reads live `Membership` and `Entitlement` rows through
// `@researchcrafters/db` (see TODOS/06 § Access Policy "Use memberships,
// entitlements, package status, free stages, stage gates, and roles"). The
// previous in-memory stub keyed off magic user ids ("u-paid", "u-stub") and
// has been replaced.
//
// All branches return a typed `PermissionResult`. Default-deny: any unknown
// action returns `unknown_action`, never `allowed: true`.

import { prisma, withQueryTimeout } from "@researchcrafters/db";
import type { Session } from "./auth.js";

export type PermissionAction =
  | "view_stage"
  | "submit_attempt"
  | "request_mentor_hint"
  | "request_mentor_feedback"
  | "view_branch_feedback"
  | "create_share_card"
  | "view_solution";

const KNOWN_ACTIONS: ReadonlySet<PermissionAction> = new Set<PermissionAction>([
  "view_stage",
  "submit_attempt",
  "request_mentor_hint",
  "request_mentor_feedback",
  "view_branch_feedback",
  "create_share_card",
  "view_solution",
]);

export type PermissionInput = {
  user: Session;
  packageVersionId: string;
  // Stage descriptor. The real shape comes from @researchcrafters/erp-schema;
  // we type it loosely here to keep the call sites honest.
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
  | "policy_disallows"
  | "unknown_action";

type EntitlementRow = {
  scope: string;
  packageVersionId: string | null;
  stageId: string | null;
  expiresAt: Date | null;
};

type MembershipRow = {
  plan: string;
  status: string;
};

function isExpired(row: EntitlementRow): boolean {
  if (!row.expiresAt) return false;
  return row.expiresAt.getTime() <= Date.now();
}

function isActiveProMember(membership: MembershipRow | null): boolean {
  if (!membership) return false;
  if (membership.status !== "active") return false;
  // Treat anything that isn't the explicit "free" tier as a paid plan.
  return membership.plan !== "free";
}

function hasMentorEntitlement(rows: readonly EntitlementRow[]): boolean {
  return rows.some((r) => r.scope === "mentor" && !isExpired(r));
}

function hasPackageOrStageEntitlement(
  rows: readonly EntitlementRow[],
  packageVersionId: string,
  stageDbId: string | null,
): boolean {
  return rows.some((r) => {
    if (isExpired(r)) return false;
    if (r.scope === "package" && r.packageVersionId === packageVersionId) {
      return true;
    }
    if (
      r.scope === "stage" &&
      stageDbId !== null &&
      r.stageId === stageDbId &&
      (r.packageVersionId === null || r.packageVersionId === packageVersionId)
    ) {
      return true;
    }
    return false;
  });
}

function isMentorAction(action: PermissionAction): boolean {
  return (
    action === "request_mentor_hint" || action === "request_mentor_feedback"
  );
}

export const permissions = {
  async canAccess(input: PermissionInput): Promise<PermissionResult> {
    const { user, packageVersionId, stage, action } = input;

    // Default-deny on unknown action keeps the policy closed against future
    // additions to the contract that haven't been wired into this function.
    if (!KNOWN_ACTIONS.has(action)) {
      return { allowed: false, reason: "unknown_action" };
    }

    // Authenticated check. view_stage on a free-preview unlocked stage is the
    // only path open to anonymous visitors so the catalog → overview → first
    // decision flow does not paywall before the user has any chance to try.
    if (!user.userId) {
      if (action === "view_stage" && stage.isFreePreview && !stage.isLocked) {
        return { allowed: true };
      }
      return { allowed: false, reason: "not_authenticated" };
    }

    // Stage locked at the package level — only `view_stage` proceeds (the
    // page itself can render the paywall surface). All other actions deny.
    if (stage.isLocked && action !== "view_stage") {
      return { allowed: false, reason: "stage_locked" };
    }

    // Resolve the package release and the concrete stage row. We use the row
    // for two things: confirm the stage is part of this package version's
    // free-stage release set, and surface the DB id so stage-scoped
    // entitlements can be matched.
    const [packageVersion, stageRow, membership, entitlements] =
      await Promise.all([
        withQueryTimeout(
          prisma.packageVersion.findUnique({
            where: { id: packageVersionId },
            select: { releaseFreeStageIds: true },
          }),
        ),
        withQueryTimeout(
          prisma.stage.findUnique({
            where: {
              packageVersionId_stageId: {
                packageVersionId,
                stageId: stage.ref,
              },
            },
            select: { id: true, free: true, stageId: true },
          }),
        ),
        withQueryTimeout(
          prisma.membership.findFirst({
            where: { userId: user.userId, status: "active" },
            select: { plan: true, status: true },
          }),
        ),
        withQueryTimeout(
          prisma.entitlement.findMany({
            where: { userId: user.userId },
            select: {
              scope: true,
              packageVersionId: true,
              stageId: true,
              expiresAt: true,
            },
          }),
        ),
      ]);

    const stageDbId = stageRow?.id ?? null;
    const releaseFreeStageIds = packageVersion?.releaseFreeStageIds ?? [];

    // Authoritative free-preview check: trust the input flag (the page layer
    // sets it from the package release), but also let the release row mark a
    // stage free even when the input descriptor missed it (defence in depth).
    const isFreePreview =
      stage.isFreePreview ||
      releaseFreeStageIds.includes(stage.ref) ||
      stageRow?.free === true;

    const proMember = isActiveProMember(membership);

    // Free preview stage: the catalog promise is "look at the first decision
    // for free." Allow viewing and submitting; gate solution/mentor.
    if (isFreePreview) {
      if (action === "view_stage" || action === "submit_attempt") {
        return { allowed: true };
      }
      // Canonical solutions never leak from a free preview, regardless of
      // membership tier — see TODOS/06 §Access Policy and TODOS/05 mentor
      // visibility rules.
      if (action === "view_solution") {
        return { allowed: false, reason: "no_entitlement" };
      }
      // Mentor / branch feedback / share card on a free preview stage still
      // require the appropriate entitlement or pro membership; fall through.
    }

    if (isMentorAction(action)) {
      if (proMember || hasMentorEntitlement(entitlements)) {
        return { allowed: true };
      }
      return { allowed: false, reason: "no_entitlement" };
    }

    if (action === "view_solution") {
      if (
        proMember ||
        hasPackageOrStageEntitlement(entitlements, packageVersionId, stageDbId)
      ) {
        return { allowed: true };
      }
      return { allowed: false, reason: "no_entitlement" };
    }

    // view_stage / submit_attempt / view_branch_feedback / create_share_card
    // on a paid stage: pro members or holders of a matching
    // package-/stage-scoped entitlement may proceed.
    if (
      proMember ||
      hasPackageOrStageEntitlement(entitlements, packageVersionId, stageDbId)
    ) {
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
    case "unknown_action":
      return 400;
    default:
      return 403;
  }
}
