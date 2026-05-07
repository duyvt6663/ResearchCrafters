import { describe, expect, it } from 'vitest';
import {
  aggregateTraversals,
  BRANCH_MIN_N,
  computePercent,
  NODE_MIN_N,
  roundToNearestFive,
  runBranchStatsRollup,
  type BranchStatsPrisma,
} from '../src/jobs/branch-stats-rollup.js';

interface FakeRow {
  decisionNodeId: string;
  branchId: string | null;
  enrollment: { packageVersionId: string };
}

function row(decisionNodeId: string, branchId: string | null): FakeRow {
  return {
    decisionNodeId,
    branchId,
    enrollment: { packageVersionId: 'pv_1' },
  };
}

describe('roundToNearestFive', () => {
  it('rounds half-way values to the nearest 5', () => {
    expect(roundToNearestFive(0)).toBe(0);
    expect(roundToNearestFive(2)).toBe(0);
    expect(roundToNearestFive(2.5)).toBe(5);
    expect(roundToNearestFive(7)).toBe(5);
    expect(roundToNearestFive(8)).toBe(10);
    expect(roundToNearestFive(97.5)).toBe(100);
  });
});

describe('computePercent', () => {
  it('suppresses when node N is below the threshold', () => {
    expect(computePercent(BRANCH_MIN_N, NODE_MIN_N - 1)).toBeNull();
  });

  it('suppresses when branch N is below the threshold', () => {
    expect(computePercent(BRANCH_MIN_N - 1, NODE_MIN_N + 10)).toBeNull();
  });

  it('rounds the published percent to nearest 5', () => {
    // 7 / 20 = 35%, already a multiple of 5
    expect(computePercent(7, 20)).toBe(35);
    // 8 / 20 = 40%
    expect(computePercent(8, 20)).toBe(40);
    // 17 / 50 = 34% -> rounds to 35
    expect(computePercent(17, 50)).toBe(35);
  });
});

describe('aggregateTraversals', () => {
  it('counts node and branch totals and ignores null branchIds', () => {
    const rows: FakeRow[] = [
      row('N1', 'B1'),
      row('N1', 'B1'),
      row('N1', 'B2'),
      row('N1', null),
      row('N2', 'B3'),
    ];

    const out = aggregateTraversals(rows);
    const n1b1 = out.find(
      (r) => r.decisionNodeId === 'N1' && r.branchId === 'B1',
    );
    const n1b2 = out.find(
      (r) => r.decisionNodeId === 'N1' && r.branchId === 'B2',
    );
    const n2b3 = out.find(
      (r) => r.decisionNodeId === 'N2' && r.branchId === 'B3',
    );

    expect(n1b1?.branchN).toBe(2);
    expect(n1b1?.nodeN).toBe(3);
    expect(n1b2?.branchN).toBe(1);
    expect(n1b2?.nodeN).toBe(3);
    expect(n2b3?.branchN).toBe(1);
    expect(n2b3?.nodeN).toBe(1);
  });
});

describe('runBranchStatsRollup', () => {
  function makePrisma(traversals: FakeRow[]): {
    prisma: BranchStatsPrisma;
    creates: unknown[];
    updates: unknown[];
  } {
    const creates: unknown[] = [];
    const updates: unknown[] = [];
    const prisma: BranchStatsPrisma = {
      nodeTraversal: {
        async findMany() {
          return traversals;
        },
      },
      branchStat: {
        async findFirst() {
          return null;
        },
        async create(args) {
          creates.push(args);
          return args;
        },
        async update(args) {
          updates.push(args);
          return args;
        },
      },
    };
    return { prisma, creates, updates };
  }

  it('writes branch rows with suppressed percent when node N is too low', async () => {
    // 1 traversal of B1 at N1 — node N=1, branch N=1, both below thresholds.
    const traversals: FakeRow[] = [row('N1', 'B1')];
    const { prisma, creates } = makePrisma(traversals);

    const result = await runBranchStatsRollup(
      {
        packageVersionId: 'pv_1',
        cohort: 'all_attempts',
        windowStart: '2026-01-01T00:00:00.000Z',
        windowEnd: '2026-02-01T00:00:00.000Z',
      },
      prisma,
    );

    expect(result.rollupCount).toBe(1);
    const created = creates[0] as { data: { percent: number | null; n: number } };
    expect(created.data.percent).toBeNull();
    expect(created.data.n).toBe(1);
  });

  it('publishes rounded percent when both node and branch N pass', async () => {
    const traversals: FakeRow[] = [];
    // 25 traversals of B1, 5 of B2 -> node N=30, B1 N=25, B2 N=5
    for (let i = 0; i < 25; i += 1) traversals.push(row('N1', 'B1'));
    for (let i = 0; i < 5; i += 1) traversals.push(row('N1', 'B2'));

    const { prisma, creates } = makePrisma(traversals);

    const result = await runBranchStatsRollup(
      {
        packageVersionId: 'pv_1',
        cohort: 'all_attempts',
        windowStart: '2026-01-01T00:00:00.000Z',
        windowEnd: '2026-02-01T00:00:00.000Z',
      },
      prisma,
    );

    expect(result.rollupCount).toBe(2);
    const b1 = (creates as Array<{ data: { branchId: string; percent: number | null } }>).find(
      (c) => c.data.branchId === 'B1',
    );
    const b2 = (creates as Array<{ data: { branchId: string; percent: number | null } }>).find(
      (c) => c.data.branchId === 'B2',
    );
    // B1: 25/30 = 83.33 -> rounds to 85
    expect(b1?.data.percent).toBe(85);
    // B2: 5/30 = 16.67 -> rounds to 15
    expect(b2?.data.percent).toBe(15);
  });

  it('updates existing rows instead of creating duplicates (idempotent)', async () => {
    const traversals: FakeRow[] = [];
    for (let i = 0; i < 10; i += 1) traversals.push(row('N1', 'B1'));

    const updates: unknown[] = [];
    const prisma: BranchStatsPrisma = {
      nodeTraversal: {
        async findMany() {
          return traversals;
        },
      },
      branchStat: {
        async findFirst() {
          return { id: 'bs_existing' };
        },
        async create() {
          throw new Error('should not create when row exists');
        },
        async update(args) {
          updates.push(args);
          return args;
        },
      },
    };

    const result = await runBranchStatsRollup(
      {
        packageVersionId: 'pv_1',
        cohort: 'all_attempts',
        windowStart: '2026-01-01T00:00:00.000Z',
        windowEnd: '2026-02-01T00:00:00.000Z',
      },
      prisma,
    );

    expect(result.rollupCount).toBe(1);
    expect(updates).toHaveLength(1);
    const u = updates[0] as { where: { id: string } };
    expect(u.where.id).toBe('bs_existing');
  });
});
