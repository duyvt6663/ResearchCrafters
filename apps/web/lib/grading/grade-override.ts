// Reviewer override entry point. The Prisma-backed `GradeStore` lives in
// `@researchcrafters/db` so the same persistence path is shared with the
// worker grader; this module owns the reviewer-facing telemetry snapshot and
// the SDK `applyOverride` glue.

import {
  applyOverride,
  type Grade as SdkGrade,
  type GradeOverrideEntry,
} from "@researchcrafters/evaluator-sdk";
import {
  GradeNotFoundError,
  makePrismaGradeStore,
  prisma,
  withQueryTimeout,
} from "@researchcrafters/db";

export { GradeNotFoundError, makePrismaGradeStore };

export interface ReviewerOverrideResult {
  grade: SdkGrade;
  /** Score before the override was applied. */
  previousScore: number | null;
  /** Score after the override was applied. */
  nextScore: number | null;
}

/**
 * Read the current Grade row for telemetry and apply a reviewer override with
 * transactional persistence.
 */
export async function applyReviewerOverride(input: {
  gradeId: string;
  reviewerId: string;
  note: string;
  override: GradeOverrideEntry["override"];
  now?: () => string;
}): Promise<ReviewerOverrideResult> {
  // Snapshot prior score outside the transaction (only used for telemetry —
  // an out-of-band value is acceptable here).
  const prior = (await withQueryTimeout(
    prisma.grade.findUnique({
      where: { id: input.gradeId },
      select: { score: true },
    }),
  )) as { score: number | null } | null;
  if (!prior) throw new GradeNotFoundError(input.gradeId);

  const store = makePrismaGradeStore();
  const updated = await applyOverride({
    gradeId: input.gradeId,
    reviewerId: input.reviewerId,
    note: input.note,
    override: input.override,
    store,
    ...(input.now ? { now: input.now } : {}),
  });

  return {
    grade: updated,
    previousScore: prior.score,
    nextScore:
      input.override.rubricScore !== undefined
        ? input.override.rubricScore
        : prior.score,
  };
}
