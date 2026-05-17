// Read per-package mentor budget caps off `PackageVersion`. The Prisma
// schema exposes three nullable USD columns
// (`mentorBudgetUserDailyUsd`, `mentorBudgetPackageUsd`,
// `mentorBudgetStageUsd`); `null` means inherit the platform default
// resolved by `defaultMentorBudgetCaps()` in
// `apps/web/lib/mentor-runtime.ts`, while any non-null value pins that
// scope to a package-specific cap enforced by `checkBudget` and
// `recordMentorRequestSpend` in `packages/ai/src/cost-cap.ts`.
//
// Kept in `packages/db` (rather than `packages/ai`) so the resolver lives
// next to the schema it reads and stays free of an `ai` -> `db` dependency.

import {
  prisma as defaultPrisma,
  withQueryTimeout as defaultWithQueryTimeout,
} from "./client.js";

export interface MentorBudgetCapsUsd {
  perUserDailyUsd: number;
  perPackageUsd: number;
  perStageUsd: number;
}

interface PackageVersionBudgetRow {
  mentorBudgetUserDailyUsd: number | null;
  mentorBudgetPackageUsd: number | null;
  mentorBudgetStageUsd: number | null;
}

// Subset of the Prisma client we touch. Exposing this lets unit tests pass a
// hand-rolled mock without pulling in `@prisma/client` plumbing.
export interface MentorBudgetCapsPrisma {
  packageVersion: {
    findUnique(args: {
      where: { id: string };
      select: {
        mentorBudgetUserDailyUsd: true;
        mentorBudgetPackageUsd: true;
        mentorBudgetStageUsd: true;
      };
    }): Promise<PackageVersionBudgetRow | null>;
  };
}

export interface ResolveMentorBudgetCapsOptions {
  prisma?: MentorBudgetCapsPrisma;
  /**
   * Query timeout wrapper, mirroring the rest of `packages/db`. Defaults to
   * the shared `withQueryTimeout` so the lookup honours the same circuit
   * breaker as every other Prisma read.
   */
  withQueryTimeout?: <T>(promise: Promise<T>) => Promise<T>;
}

export class PackageVersionNotFoundError extends Error {
  constructor(packageVersionId: string) {
    super(`package version ${packageVersionId} not found`);
    this.name = "PackageVersionNotFoundError";
  }
}

/**
 * Resolve effective mentor budget caps for a package version.
 *
 * Reads the three nullable columns on `PackageVersion` and overlays them on
 * `defaults`. Any column that is `null` falls back to the corresponding
 * default; non-null columns override. Throws `PackageVersionNotFoundError`
 * when the id does not exist so callers don't silently apply defaults to a
 * mistyped package.
 */
export async function resolveMentorBudgetCaps(
  packageVersionId: string,
  defaults: MentorBudgetCapsUsd,
  options: ResolveMentorBudgetCapsOptions = {},
): Promise<MentorBudgetCapsUsd> {
  const prisma = options.prisma ?? (defaultPrisma as unknown as MentorBudgetCapsPrisma);
  const withTimeout = options.withQueryTimeout ?? defaultWithQueryTimeout;

  const row = await withTimeout(
    prisma.packageVersion.findUnique({
      where: { id: packageVersionId },
      select: {
        mentorBudgetUserDailyUsd: true,
        mentorBudgetPackageUsd: true,
        mentorBudgetStageUsd: true,
      },
    }),
  );

  if (!row) {
    throw new PackageVersionNotFoundError(packageVersionId);
  }

  return {
    perUserDailyUsd: pickPositive(row.mentorBudgetUserDailyUsd, defaults.perUserDailyUsd),
    perPackageUsd: pickPositive(row.mentorBudgetPackageUsd, defaults.perPackageUsd),
    perStageUsd: pickPositive(row.mentorBudgetStageUsd, defaults.perStageUsd),
  };
}

function pickPositive(value: number | null, fallback: number): number {
  return value != null && Number.isFinite(value) && value > 0 ? value : fallback;
}
