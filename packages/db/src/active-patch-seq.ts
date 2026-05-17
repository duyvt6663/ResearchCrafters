// Resolve the active `PackageVersionPatch.patchSeq` for a package version.
//
// `PackageVersionPatch` rows accumulate cosmetic overlays against a base
// `PackageVersion` (see `packages/erp-schema/src/schemas/patch.ts` for the
// closed cosmetic vocabulary). Each row carries a monotonically increasing
// `patchSeq` (unique per `packageVersionId`); the "active" patch_seq is the
// max value currently present, or 0 when no patches have shipped against
// the version (i.e. the base manifest is authoritative).
//
// backlog/06-data-access-analytics.md §Version and Patch Policy line 69 —
// stage attempts must record the active patch_seq at creation time so
// later analytics, replays, and grade audits can attribute the attempt to
// a specific patch generation even after newer patches land.

import {
  prisma as defaultPrisma,
  withQueryTimeout as defaultWithQueryTimeout,
} from "./client.js";

export interface ActivePatchSeqPrisma {
  packageVersionPatch: {
    aggregate(args: {
      where: { packageVersionId: string };
      _max: { patchSeq: true };
    }): Promise<{ _max: { patchSeq: number | null } }>;
  };
}

export interface ResolveActivePatchSeqOptions {
  prisma?: ActivePatchSeqPrisma;
  /**
   * Query timeout wrapper. Defaults to the shared `withQueryTimeout` so the
   * lookup honours the same circuit breaker as every other Prisma read.
   */
  withQueryTimeout?: <T>(promise: Promise<T>) => Promise<T>;
}

/**
 * Returns the highest `PackageVersionPatch.patchSeq` for the given package
 * version, or `0` when no patches exist (base package version). Negative
 * values cannot occur because the column is a non-negative monotonic
 * sequence in `PackageVersionPatch`; we still clamp to 0 defensively so a
 * malformed row can never push a stage attempt below baseline.
 */
export async function resolveActivePatchSeq(
  packageVersionId: string,
  options: ResolveActivePatchSeqOptions = {},
): Promise<number> {
  const prisma = options.prisma ?? (defaultPrisma as unknown as ActivePatchSeqPrisma);
  const withTimeout = options.withQueryTimeout ?? defaultWithQueryTimeout;

  const result = await withTimeout(
    prisma.packageVersionPatch.aggregate({
      where: { packageVersionId },
      _max: { patchSeq: true },
    }),
  );

  const max = result?._max?.patchSeq;
  if (max == null || !Number.isFinite(max) || max < 0) {
    return 0;
  }
  return Math.floor(max);
}
