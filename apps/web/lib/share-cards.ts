import type { ShareCardPayload } from "@researchcrafters/ui/components";

/**
 * Branch types as authored in the package manifest. The public share-card
 * surface keeps `failed` private — it maps to `alternative` so a learner who
 * picked a failed branch can still share without exposing that signal.
 */
export type AuthoredBranchType = "canonical" | "suboptimal" | "failed";

export type ShareCardBranchKind = NonNullable<
  ShareCardPayload["selectedBranchType"]
>;

export interface ShareCardEnrollmentInput {
  packageSlug: string;
  packageVersionId: string;
  completedStageRefs: readonly string[];
}

export interface ShareCardPackageInput {
  stages: ReadonlyArray<{ ref: string }>;
  sampleDecision?: { prompt?: string | null } | null;
}

/**
 * Minimum-N thresholds mirrored from
 * `apps/worker/src/jobs/branch-stats-rollup.ts`. Duplicated rather than
 * imported so the web build stays free of the worker package; both
 * constants are pinned by the worker's `branch-stats-thresholds.test.ts`
 * and by this file's `share-cards.test.ts` so they cannot silently drift.
 *
 * Per backlog/06 "Branch Stats and Privacy" and backlog/00-roadmap.md:105
 * ("Users can share results without leaking low-N cohort data"), a cohort
 * percentage is only safe to emit when the per-node and per-branch samples
 * both clear these thresholds.
 */
export const SHARE_CARD_NODE_MIN_N = 20;
export const SHARE_CARD_BRANCH_MIN_N = 5;

export interface CohortSample {
  /** Number of traversals through the decision node in this cohort/window. */
  nodeN: number;
  /** Number of traversals that picked the learner's branch. */
  branchN: number;
}

/**
 * Returns a cohort percentage only when both N values clear the minimum-N
 * thresholds. Otherwise returns `null` (the suppressed sentinel used by
 * `ShareCardPayload.cohortPercentage`).
 *
 * Rounded to the nearest 5% to match the worker rollup so the route, the
 * preview, and the worker all surface the same bucketed value.
 */
export function safeCohortPercentage(sample: CohortSample): number | null {
  const { nodeN, branchN } = sample;
  if (!Number.isFinite(nodeN) || !Number.isFinite(branchN)) return null;
  if (nodeN < SHARE_CARD_NODE_MIN_N) return null;
  if (branchN < SHARE_CARD_BRANCH_MIN_N) return null;
  if (nodeN <= 0) return null;
  if (branchN < 0 || branchN > nodeN) return null;
  const raw = (branchN / nodeN) * 100;
  return Math.round(raw / 5) * 5;
}

export interface BuildShareCardPayloadInput {
  enrollment: ShareCardEnrollmentInput;
  pkg: ShareCardPackageInput | null;
  insight: string;
  hardestDecision?: string | null;
  selectedBranchType?: AuthoredBranchType | null;
  /**
   * Pre-suppressed cohort percentage. Ignored when `cohortSample` is also
   * supplied — the sample is authoritative and is re-checked against the
   * minimum-N thresholds here so a caller cannot accidentally leak a
   * low-N number by passing the raw percent. Pass `null` to mark the
   * cohort suppressed; omit to leave it unknown (also suppressed).
   */
  cohortPercentage?: number | null;
  /**
   * Raw cohort sample. When provided, the payload's `cohortPercentage` is
   * derived via {@link safeCohortPercentage} so the helper — not the
   * caller — is the single chokepoint enforcing minimum-N suppression.
   */
  cohortSample?: CohortSample | null;
}

export function buildShareCardPayload(
  input: BuildShareCardPayloadInput,
): ShareCardPayload {
  const total = input.pkg?.stages.length ?? 0;
  const passed = input.enrollment.completedStageRefs.length;
  const completionStatus: NonNullable<ShareCardPayload["completionStatus"]> =
    total > 0 && passed >= total ? "complete" : "in_progress";
  const hardestDecision =
    input.hardestDecision ?? input.pkg?.sampleDecision?.prompt ?? null;
  const selectedBranchType = mapBranchKind(
    input.selectedBranchType ?? null,
  );
  const cohortPercentage = deriveCohortPercentage(input);
  const payload: ShareCardPayload = {
    packageSlug: input.enrollment.packageSlug,
    packageVersionId: input.enrollment.packageVersionId,
    completionStatus,
    scoreSummary: { passed, total },
    cohortPercentage,
    learnerInsight: input.insight,
  };
  if (hardestDecision) payload.hardestDecision = hardestDecision;
  if (selectedBranchType) payload.selectedBranchType = selectedBranchType;
  return payload;
}

function deriveCohortPercentage(
  input: BuildShareCardPayloadInput,
): number | null {
  // Sample is authoritative: it carries enough info to enforce the
  // minimum-N rule locally, so a caller can never leak a low-N number by
  // also passing `cohortPercentage`.
  if (input.cohortSample) {
    return safeCohortPercentage(input.cohortSample);
  }
  if (input.cohortPercentage == null) return null;
  if (!Number.isFinite(input.cohortPercentage)) return null;
  return input.cohortPercentage;
}

function mapBranchKind(
  raw: AuthoredBranchType | null,
): ShareCardBranchKind | undefined {
  if (!raw) return undefined;
  if (raw === "failed") return "alternative";
  return raw;
}
