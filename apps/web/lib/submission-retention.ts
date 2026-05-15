// Raw submission bundle retention policy.
//
// Privacy contract
// ----------------
// Per backlog/03-cli-runner.md §Security, raw submission bundles (the S3
// objects holding the learner's uploaded code) MUST live for only a short,
// explicit window. The DB row itself is an audit artifact and outlives the
// blob — see `Submission`'s schema comment and `account-cascade.ts` for the
// row-level retention story. This module owns the *blob* side: it defines the
// window and provides the sweeper that enforces it.
//
// Window
// ------
// Default: 14 days from `Submission.createdAt`. Configurable via the
// `SUBMISSION_BUNDLE_RETENTION_DAYS` env var (positive integer). The default
// is intentionally conservative — long enough that learners can re-finalize a
// submission after a transient network failure or that an investigator can
// pull a bundle for an abuse review, short enough that a leaked S3 credential
// doesn't expose months of historical code.
//
// Sentinel
// --------
// `Submission.bundleObjectKey` is NOT NULL in the schema; we use the empty
// string as the "bundle purged" sentinel so the existing column does the job
// without a migration. Downstream code already treats `bundleObjectKey` as an
// opaque pointer that may be re-derived (`apps/web/app/api/submissions/route.ts`
// rewrites the placeholder once Prisma assigns the real id), so an empty
// value cleanly signals "no bundle to fetch" without confusing readers.
//
// Audit trail
// -----------
// Each purge sweep emits a `submission_bundle_purged` telemetry event per
// row, carrying `submissionId`, `byteSize`, and `ageDays`. The aggregate
// counts are also returned to the caller so a wrapping cron job can log a
// run summary.

import { prisma as defaultPrisma, type PrismaClient } from "@researchcrafters/db";
import { deleteObject as defaultDeleteObject, getStorageEnv } from "./storage";
import { track as defaultTrack } from "./telemetry";

/** Conservative default — see file header for the rationale. */
export const DEFAULT_SUBMISSION_BUNDLE_RETENTION_DAYS = 14;

/** Hard ceiling so a fat-finger env value can't accidentally retain forever. */
const MAX_SUBMISSION_BUNDLE_RETENTION_DAYS = 365;

/**
 * Resolve the configured retention window in days.
 *
 * Reads `SUBMISSION_BUNDLE_RETENTION_DAYS`. Falls back to
 * {@link DEFAULT_SUBMISSION_BUNDLE_RETENTION_DAYS} for missing / blank /
 * non-positive / non-finite / out-of-range values so a misconfigured env
 * never silently disables retention.
 */
export type RetentionEnv = Record<string, string | undefined>;

export function getSubmissionBundleRetentionDays(
  env: RetentionEnv = process.env,
): number {
  const raw = env["SUBMISSION_BUNDLE_RETENTION_DAYS"];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return DEFAULT_SUBMISSION_BUNDLE_RETENTION_DAYS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > MAX_SUBMISSION_BUNDLE_RETENTION_DAYS
  ) {
    return DEFAULT_SUBMISSION_BUNDLE_RETENTION_DAYS;
  }
  return parsed;
}

/**
 * Compute the explicit expiry timestamp for a submission given when its row
 * was created. Pure helper — the actual purge is driven by
 * {@link purgeExpiredSubmissionBundles}.
 */
export function submissionBundleExpiresAt(
  createdAt: Date,
  env: RetentionEnv = process.env,
): Date {
  const days = getSubmissionBundleRetentionDays(env);
  return new Date(createdAt.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Test seam — narrow Prisma surface so unit tests can drive a fake without
 * booting the generated client.
 */
export interface SubmissionRetentionPrisma {
  submission: Pick<PrismaClient["submission"], "findMany" | "update">;
}

export interface PurgeExpiredSubmissionBundlesInput {
  /** Override "now" for tests; defaults to wall clock. */
  now?: Date;
  /** Cap the number of rows touched in a single sweep; defaults to 500. */
  limit?: number;
  /** Optional Prisma override. */
  prisma?: SubmissionRetentionPrisma;
  /** Optional storage override (for tests / dry-run wrappers). */
  deleteObject?: typeof defaultDeleteObject;
  /** Optional telemetry override. */
  track?: typeof defaultTrack;
  /** Optional env override (defaults to `process.env`). */
  env?: RetentionEnv;
  /** Optional bucket override; defaults to the configured submissions bucket. */
  bucket?: string;
}

export interface PurgeExpiredSubmissionBundlesResult {
  retentionDays: number;
  /** Rows considered (i.e. matched the expiry filter). */
  considered: number;
  /** Rows whose S3 object was deleted (or already gone) AND row was marked. */
  purged: number;
  /** Rows that hit a non-recoverable error during S3 delete or DB mark. */
  failed: number;
  /** ISO timestamp the sweep was driven from. */
  ranAt: string;
}

/**
 * Sweep step: find submissions whose bundle has aged past the retention
 * window, delete the underlying S3 object, and clear `bundleObjectKey` so
 * the row is marked purged.
 *
 * The sweep is idempotent — re-running it is safe. Rows that fail mid-flight
 * (e.g. S3 transient error) are left as-is so the next sweep retries them;
 * the per-row failure does NOT abort the sweep.
 */
export async function purgeExpiredSubmissionBundles(
  input: PurgeExpiredSubmissionBundlesInput = {},
): Promise<PurgeExpiredSubmissionBundlesResult> {
  const env = input.env ?? process.env;
  const retentionDays = getSubmissionBundleRetentionDays(env);
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const limit = clampLimit(input.limit);
  const prisma = input.prisma ??
    (defaultPrisma as unknown as SubmissionRetentionPrisma);
  const doDelete = input.deleteObject ?? defaultDeleteObject;
  const track = input.track ?? defaultTrack;
  const bucket = input.bucket ?? getStorageEnv().buckets.submissions;

  const expired = await prisma.submission.findMany({
    where: {
      createdAt: { lt: cutoff },
      bundleObjectKey: { not: "" },
    },
    select: {
      id: true,
      bundleObjectKey: true,
      byteSize: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let purged = 0;
  let failed = 0;
  for (const row of expired) {
    try {
      await doDelete({ bucket, key: row.bundleObjectKey });
      await prisma.submission.update({
        where: { id: row.id },
        data: { bundleObjectKey: "" },
      });
      const ageMs = now.getTime() - row.createdAt.getTime();
      const ageDays = Math.round(ageMs / (24 * 60 * 60 * 1000));
      try {
        await track("submission_bundle_purged", {
          submissionId: row.id,
          byteSize: row.byteSize,
          ageDays,
        });
      } catch {
        // Telemetry is best-effort; never let a tracker failure mark the
        // row as failed (the blob is already gone).
      }
      purged += 1;
    } catch {
      // Leave the row for the next sweep.
      failed += 1;
    }
  }

  return {
    retentionDays,
    considered: expired.length,
    purged,
    failed,
    ranAt: now.toISOString(),
  };
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return 500;
  }
  return Math.min(Math.floor(limit), 5000);
}
