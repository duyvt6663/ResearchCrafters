// Prisma-backed reviewer override path for the Grade model.
//
// `applyOverride` from `@researchcrafters/evaluator-sdk` validates the
// reviewer-supplied note + reviewer id and constructs the
// `GradeOverrideEntry`. It then delegates persistence to a `GradeStore`. This
// module supplies a thin adapter that:
//
//   * Reads and updates the current Grade row inside a transaction so the
//     appended history entry and mirrored scalar columns stay in sync.
//   * Appends the entry to the `history` JSON array (append-only — never
//     mutates prior entries).
//   * Mirrors the override patch onto the scalar columns the rest of the app
//     reads from (`passed`, `score`).
//
// The `Grade` Prisma row does not carry a `feedback` column; reviewer
// feedback is preserved on the history entry itself, which the GET surface
// passes through to the learner. Status maps to `passed` (the only boolean
// the Prisma model exposes): `passed` → true; anything else → false. We
// intentionally do not infer scores from status — the override patch is
// applied as-is.

import {
  applyOverride,
  type Grade as SdkGrade,
  type GradeOverrideEntry,
  type GradeStore,
} from "@researchcrafters/evaluator-sdk";
import { prisma, withQueryTimeout } from "@researchcrafters/db";

export class GradeNotFoundError extends Error {
  constructor(gradeId: string) {
    super(`grade ${gradeId} not found`);
    this.name = "GradeNotFoundError";
  }
}

type PrismaGradeRow = {
  id: string;
  stageAttemptId: string;
  submissionId: string | null;
  rubricVersion: string;
  evaluatorVersion: string;
  passed: boolean;
  score: number | null;
  dimensions: unknown;
  evidenceRefs: unknown;
  modelMeta: unknown;
  history: unknown;
  createdAt: Date;
};

function isOverrideEntry(value: unknown): value is GradeOverrideEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["reviewerId"] === "string" &&
    typeof v["note"] === "string" &&
    typeof v["appliedAt"] === "string" &&
    typeof v["override"] === "object" &&
    v["override"] !== null
  );
}

function normalizeHistory(raw: unknown): GradeOverrideEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isOverrideEntry);
}

function rowToSdkGrade(row: PrismaGradeRow): SdkGrade {
  return {
    id: row.id,
    submissionId: row.submissionId ?? "",
    stageId: row.stageAttemptId,
    rubricVersion: row.rubricVersion,
    evaluatorVersion: row.evaluatorVersion,
    status: row.passed ? "passed" : "failed",
    rubricScore: row.score ?? 0,
    passThreshold: 0,
    dimensions: [],
    feedback: "",
    history: normalizeHistory(row.history),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Constructs a `GradeStore` whose `appendOverride` writes to Prisma. The
 * other store methods are unused by `applyOverride` and throw if called.
 */
export function makePrismaGradeStore(): GradeStore {
  return {
    async findByKey(): Promise<SdkGrade | null> {
      throw new Error("PrismaGradeStore.findByKey is not implemented");
    },
    async insert(): Promise<SdkGrade> {
      throw new Error("PrismaGradeStore.insert is not implemented");
    },
    async appendOverride(
      gradeId: string,
      entry: GradeOverrideEntry,
    ): Promise<SdkGrade> {
      return withQueryTimeout(
        prisma.$transaction(async (tx) => {
          const row = (await tx.grade.findUnique({
            where: { id: gradeId },
          })) as PrismaGradeRow | null;
          if (!row) throw new GradeNotFoundError(gradeId);

          const history = normalizeHistory(row.history);
          const nextHistory = [...history, entry];

          const data: Record<string, unknown> = {
            history: nextHistory as unknown as object,
          };
          if (entry.override.status !== undefined) {
            data["passed"] = entry.override.status === "passed";
          }
          if (entry.override.rubricScore !== undefined) {
            data["score"] = entry.override.rubricScore;
          }

          const updated = (await tx.grade.update({
            where: { id: gradeId },
            data,
          })) as PrismaGradeRow;
          return rowToSdkGrade(updated);
        }),
      );
    },
  };
}

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
