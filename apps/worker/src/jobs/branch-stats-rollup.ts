import type { Cohort } from '@researchcrafters/telemetry';

/**
 * @deprecated use `Cohort` from `@researchcrafters/telemetry`. Kept as an
 * alias so existing call sites and tests keep compiling.
 */
export type BranchStatsCohort = Cohort;

export interface BranchStatsRollupJob {
  packageVersionId: string;
  cohort: Cohort;
  /** ISO 8601. */
  windowStart: string;
  /** ISO 8601. */
  windowEnd: string;
}

export interface BranchStatsRollupResult {
  rollupCount: number;
}

/**
 * Min-N suppression rules from backlog/06 §Branch Stats and Privacy.
 *   - Per-decision-node N must be >= 20 before publishing any branch percent.
 *   - Per-branch N must be >= 5 before publishing that branch's percent.
 *   - Otherwise, persist the row with `percent = null` so the web shows
 *     "rare branch" copy.
 */
export const NODE_MIN_N = 20;
export const BRANCH_MIN_N = 5;

interface NodeTraversalRow {
  decisionNodeId: string;
  branchId: string | null;
  enrollment: { packageVersionId: string };
}

/**
 * Narrow surface of `prisma` we use here. Defined explicitly so tests can
 * mock without dragging in the generated Prisma types.
 */
export interface BranchStatsPrisma {
  nodeTraversal: {
    findMany(args: {
      where: {
        selectedAt: { gte: Date; lt: Date };
        enrollment: { packageVersionId: string };
      };
      select: {
        decisionNodeId: true;
        branchId: true;
        enrollment: { select: { packageVersionId: true } };
      };
    }): Promise<NodeTraversalRow[]>;
  };
  branchStat: {
    findFirst(args: {
      where: {
        packageVersionId: string;
        decisionNodeId: string;
        branchId: string;
        cohort: string;
        windowStart: Date;
      };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        packageVersionId: string;
        decisionNodeId: string;
        branchId: string;
        cohort: string;
        windowStart: Date;
        windowEnd: Date;
        n: number;
        percent: number | null;
      };
    }): Promise<unknown>;
    update(args: {
      where: { id: string };
      data: { n: number; percent: number | null; windowEnd: Date };
    }): Promise<unknown>;
  };
}

export function roundToNearestFive(percent: number): number {
  return Math.round(percent / 5) * 5;
}

interface AggregatedRow {
  decisionNodeId: string;
  branchId: string;
  branchN: number;
  nodeN: number;
}

export function aggregateTraversals(
  rows: ReadonlyArray<NodeTraversalRow>,
): AggregatedRow[] {
  const nodeCounts = new Map<string, number>();
  const branchCounts = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (!row.branchId) continue;
    nodeCounts.set(row.decisionNodeId, (nodeCounts.get(row.decisionNodeId) ?? 0) + 1);
    const inner = branchCounts.get(row.decisionNodeId) ?? new Map<string, number>();
    inner.set(row.branchId, (inner.get(row.branchId) ?? 0) + 1);
    branchCounts.set(row.decisionNodeId, inner);
  }

  const out: AggregatedRow[] = [];
  for (const [nodeId, branches] of branchCounts) {
    const nodeN = nodeCounts.get(nodeId) ?? 0;
    for (const [branchId, branchN] of branches) {
      out.push({ decisionNodeId: nodeId, branchId, branchN, nodeN });
    }
  }
  return out;
}

export function computePercent(
  branchN: number,
  nodeN: number,
): number | null {
  if (nodeN < NODE_MIN_N) return null;
  if (branchN < BRANCH_MIN_N) return null;
  if (nodeN === 0) return null;
  const raw = (branchN / nodeN) * 100;
  return roundToNearestFive(raw);
}

export async function runBranchStatsRollup(
  job: BranchStatsRollupJob,
  prisma: BranchStatsPrisma,
): Promise<BranchStatsRollupResult> {
  const windowStart = new Date(job.windowStart);
  const windowEnd = new Date(job.windowEnd);

  const traversals = await prisma.nodeTraversal.findMany({
    where: {
      selectedAt: { gte: windowStart, lt: windowEnd },
      enrollment: { packageVersionId: job.packageVersionId },
    },
    select: {
      decisionNodeId: true,
      branchId: true,
      enrollment: { select: { packageVersionId: true } },
    },
  });

  const aggregated = aggregateTraversals(traversals);
  let rollupCount = 0;

  for (const row of aggregated) {
    const percent = computePercent(row.branchN, row.nodeN);
    const existing = await prisma.branchStat.findFirst({
      where: {
        packageVersionId: job.packageVersionId,
        decisionNodeId: row.decisionNodeId,
        branchId: row.branchId,
        cohort: job.cohort,
        windowStart,
      },
    });
    if (existing) {
      await prisma.branchStat.update({
        where: { id: existing.id },
        data: { n: row.branchN, percent, windowEnd },
      });
    } else {
      await prisma.branchStat.create({
        data: {
          packageVersionId: job.packageVersionId,
          decisionNodeId: row.decisionNodeId,
          branchId: row.branchId,
          cohort: job.cohort,
          windowStart,
          windowEnd,
          n: row.branchN,
          percent,
        },
      });
    }
    rollupCount += 1;
  }

  return { rollupCount };
}
