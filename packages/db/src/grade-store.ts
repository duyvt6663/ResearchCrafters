// Prisma-backed implementation of the evaluator-sdk `GradeStore`. This is
// the production replacement for `InMemoryGradeStore`: every method round-
// trips through the `Grade` table so grades survive process restarts and are
// idempotent on `(submissionId, rubricVersion, evaluatorVersion)`.
//
// `findByKey` is keyed on the SDK's idempotency string
// (`submissionId::rubricVersion::evaluatorVersion`); we parse the tuple back
// out and consult the compound unique index Prisma generates from
// `@@unique([submissionId, rubricVersion, evaluatorVersion])`.
//
// `insert` translates an SDK `Grade` into a Prisma row insert. The Prisma
// schema does not carry a `feedback` column — feedback lives only on the
// SDK Grade and on override history entries — so it is intentionally not
// persisted by the store. `passThreshold` is similarly absent from the row;
// callers reconstruct it from rubric/stage metadata when reading.
//
// `appendOverride` is the same transactional path the web reviewer endpoint
// uses; we retain it here so a single shared factory backs both the worker's
// `gradeAttempt` (`findByKey` + `insert`) and the reviewer override route
// (`appendOverride`).

import type {
  Grade as SdkGrade,
  GradeOverrideEntry,
  GradeStatus,
  GradeStore,
  RubricDimensionScore,
} from "@researchcrafters/evaluator-sdk";
import { prisma as defaultPrisma, withQueryTimeout as defaultWithQueryTimeout } from "./client.js";

export class GradeNotFoundError extends Error {
  constructor(gradeId: string) {
    super(`grade ${gradeId} not found`);
    this.name = "GradeNotFoundError";
  }
}

interface PrismaGradeRow {
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
}

// Subset of the Prisma client we touch. Exposing this lets unit tests pass a
// hand-rolled mock without pulling in `@prisma/client` plumbing.
export interface GradeStorePrisma {
  grade: {
    findUnique(args: {
      where:
        | { id: string }
        | {
            submissionId_rubricVersion_evaluatorVersion: {
              submissionId: string;
              rubricVersion: string;
              evaluatorVersion: string;
            };
          };
    }): Promise<PrismaGradeRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<PrismaGradeRow>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<PrismaGradeRow>;
  };
  $transaction<T>(fn: (tx: GradeStorePrisma) => Promise<T>): Promise<T>;
}

export interface MakePrismaGradeStoreOptions {
  /** Override the Prisma client surface; defaults to `packages/db`'s singleton. */
  prisma?: GradeStorePrisma;
  /** Override the query-timeout wrapper; defaults to `withQueryTimeout`. */
  withQueryTimeout?: <T>(p: Promise<T>) => Promise<T>;
}

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

function isRubricDimensionScore(value: unknown): value is RubricDimensionScore {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["label"] === "string" &&
    typeof v["score"] === "number" &&
    typeof v["weight"] === "number"
  );
}

function normalizeDimensions(raw: unknown): RubricDimensionScore[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRubricDimensionScore);
}

function statusFromRow(row: PrismaGradeRow, history: GradeOverrideEntry[]): GradeStatus {
  // Reviewer overrides may have stamped a richer status (e.g. `partial`) that
  // the Prisma `passed` boolean cannot represent. Replay the history so the
  // returned SDK Grade reflects the most recent override status when present.
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry && entry.override.status !== undefined) {
      return entry.override.status;
    }
  }
  return row.passed ? "passed" : "failed";
}

function rowToSdkGrade(row: PrismaGradeRow): SdkGrade {
  const history = normalizeHistory(row.history);
  return {
    id: row.id,
    submissionId: row.submissionId ?? "",
    stageId: row.stageAttemptId,
    rubricVersion: row.rubricVersion,
    evaluatorVersion: row.evaluatorVersion,
    status: statusFromRow(row, history),
    rubricScore: row.score ?? 0,
    // The Prisma row does not persist `passThreshold` — callers that need
    // it reconstruct from rubric/stage metadata. Use 0 as a safe neutral so
    // round-trip code that does not consult the threshold keeps working.
    passThreshold: 0,
    dimensions: normalizeDimensions(row.dimensions),
    // Feedback is not persisted on the row; the reviewer-facing view stitches
    // it from override history. Worker callers that just round-trip a grade
    // for idempotency ignore this field.
    feedback: "",
    history,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseIdempotencyKey(key: string): {
  submissionId: string;
  rubricVersion: string;
  evaluatorVersion: string;
} | null {
  // The SDK builds the key as `${submissionId}::${rubricVersion}::${evaluatorVersion}`.
  // None of those tuple parts contain `::` in practice, so a positional split
  // is safe; if the SDK ever changes the separator we want to fail closed
  // (return null) rather than silently mis-lookup.
  const parts = key.split("::");
  if (parts.length !== 3) return null;
  const [submissionId, rubricVersion, evaluatorVersion] = parts as [string, string, string];
  if (!submissionId || !rubricVersion || !evaluatorVersion) return null;
  return { submissionId, rubricVersion, evaluatorVersion };
}

function flattenEvidenceRefs(dimensions: ReadonlyArray<RubricDimensionScore>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dim of dimensions) {
    for (const ref of dim.evidenceRefs ?? []) {
      if (!seen.has(ref)) {
        seen.add(ref);
        out.push(ref);
      }
    }
  }
  return out;
}

/**
 * Construct a Prisma-backed `GradeStore`. Defaults to the singleton client
 * from `@researchcrafters/db`; tests can pass a mock surface to exercise the
 * mapping without a live database.
 */
export function makePrismaGradeStore(
  opts: MakePrismaGradeStoreOptions = {},
): GradeStore {
  const prisma = opts.prisma ?? (defaultPrisma as unknown as GradeStorePrisma);
  const withTimeout =
    opts.withQueryTimeout ?? (<T>(p: Promise<T>) => defaultWithQueryTimeout(p));

  return {
    async findByKey(key) {
      const parsed = parseIdempotencyKey(key);
      if (!parsed) return null;
      const row = await withTimeout(
        prisma.grade.findUnique({
          where: {
            submissionId_rubricVersion_evaluatorVersion: parsed,
          },
        }),
      );
      return row ? rowToSdkGrade(row) : null;
    },

    async insert(grade) {
      // The Prisma compound unique index enforces idempotency at the DB level;
      // callers that already consulted `findByKey` will only land here when no
      // existing row matches. If the caller skipped that check, Prisma will
      // raise `P2002` from the unique constraint — we surface it as-is so the
      // caller can retry through `findByKey`.
      const passed = grade.status === "passed";
      const row = await withTimeout(
        prisma.grade.create({
          data: {
            id: grade.id,
            stageAttemptId: grade.stageId,
            // The Prisma column is nullable; treat an empty string as "no
            // submission" to keep the FK honest.
            submissionId: grade.submissionId === "" ? null : grade.submissionId,
            rubricVersion: grade.rubricVersion,
            evaluatorVersion: grade.evaluatorVersion,
            passed,
            score: grade.rubricScore,
            dimensions: grade.dimensions as unknown as object,
            evidenceRefs: flattenEvidenceRefs(grade.dimensions) as unknown as object,
            modelMeta: (grade.model ?? null) as unknown as object | null,
            history: grade.history as unknown as object,
            createdAt: new Date(grade.createdAt),
          },
        }),
      );
      return rowToSdkGrade(row);
    },

    async appendOverride(gradeId, entry) {
      return withTimeout(
        prisma.$transaction(async (tx) => {
          const row = await tx.grade.findUnique({ where: { id: gradeId } });
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

          const updated = await tx.grade.update({
            where: { id: gradeId },
            data,
          });
          return rowToSdkGrade(updated);
        }),
      );
    },
  };
}
