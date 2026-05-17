// Scheduler: registers BullMQ repeating jobs against a live Redis.
//
// Today only `branch_stats_rollup` runs on a recurring schedule (every 15
// minutes, one job per known cohort, rolling [now-1h, now] window). The other
// queues (`share_card_render`, `event_dual_write`) are pushed by the web app
// on demand, so they are not scheduled here.
//
// Idempotency: BullMQ deduplicates repeating jobs by their repeat key (derived
// from `name`, `repeatPattern`, and the optional explicit `jobId`). Re-running
// `installSchedules` therefore does NOT create duplicate timers — calling
// `Queue.add` with the same `(name, jobId, repeat.pattern)` is a no-op on the
// repeat side, which is the property the boot path relies on.
//
// We pin a stable `jobId` per `(queue, cohort)` so re-installs are observably
// the same row; without it BullMQ would still dedupe by repeat-key, but the
// underlying repeatable-job descriptor would carry a different opaque id and
// the `Repeatable` Redis hash would accumulate orphans across boots.

import { PUBLIC_COHORTS, type Cohort } from '@researchcrafters/telemetry';
import {
  BRANCH_STATS_ROLLUP_QUEUE,
  type QueueName,
} from './queues.js';
import type { BranchStatsRollupJob } from './jobs/branch-stats-rollup.js';

/**
 * Connection options shape we accept. Mirrors the small subset of
 * `bullmq.ConnectionOptions` we actually pass through; declared explicitly so
 * callers don't need to import bullmq's types.
 */
export interface SchedulerConnection {
  url?: string;
  maxRetriesPerRequest?: number | null;
  [k: string]: unknown;
}

/**
 * Cohorts we publish branch-stats for on a schedule. Derived from
 * `PUBLIC_COHORTS` so the single source of truth for which cohorts may
 * surface in public, learner-facing UI also drives what the recurring rollup
 * computes — `alpha_beta` stays off the schedule because it is marked
 * `includeInPublicPercentages: false`. Backfill it via the admin trigger when
 * needed for internal analysis.
 */
export const SCHEDULED_BRANCH_STATS_COHORTS: readonly Cohort[] = PUBLIC_COHORTS;

export type ScheduledCohort = Cohort;

/**
 * Cron pattern: every 15 minutes, on the quarter hour. BullMQ accepts standard
 * 5-field cron with seconds optional; we use the 5-field form so the
 * underlying `cron-parser` is unambiguous.
 */
export const BRANCH_STATS_ROLLUP_CRON = '*/15 * * * *';

/** Rolling window length applied at enqueue time. */
const ROLLING_WINDOW_MS = 60 * 60 * 1000;

export interface InstalledSchedule {
  queueName: QueueName;
  jobName: string;
  jobId: string;
  pattern: string;
}

export interface RepeatOptions {
  pattern: string;
}

export interface AddOptions {
  jobId?: string;
  repeat?: RepeatOptions;
}

/**
 * Narrow Queue surface the scheduler needs. Defined explicitly so tests can
 * mock with a plain object, and so we don't leak `bullmq` types into call
 * sites that just want a producer reference.
 */
export interface SchedulerQueue {
  name: string;
  add(
    jobName: string,
    payload: unknown,
    opts?: AddOptions,
  ): Promise<unknown>;
  removeRepeatable(
    jobName: string,
    repeat: RepeatOptions,
    jobId?: string,
  ): Promise<boolean>;
  close(): Promise<unknown>;
}

/** Factory used to build a Queue. Overridable in tests. */
export type QueueFactory = (
  name: QueueName,
  connection: SchedulerConnection,
) => SchedulerQueue;

let queueFactoryOverride: QueueFactory | null = null;

/** Test seam — replace with a fake Queue constructor. */
export function _setQueueFactoryForTests(factory: QueueFactory | null): void {
  queueFactoryOverride = factory;
}

async function defaultQueueFactory(
  name: QueueName,
  connection: SchedulerConnection,
): Promise<SchedulerQueue> {
  const bullmq = (await import('bullmq')) as {
    Queue: new (
      name: string,
      opts: { connection: SchedulerConnection },
    ) => SchedulerQueue;
  };
  return new bullmq.Queue(name, { connection });
}

async function makeQueue(
  name: QueueName,
  connection: SchedulerConnection,
): Promise<SchedulerQueue> {
  if (queueFactoryOverride) {
    return queueFactoryOverride(name, connection);
  }
  return defaultQueueFactory(name, connection);
}

function buildBranchStatsPayload(
  cohort: ScheduledCohort,
  packageVersionId: string,
  now: Date = new Date(),
): BranchStatsRollupJob {
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - ROLLING_WINDOW_MS);
  return {
    packageVersionId,
    cohort,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };
}

/**
 * Discover live `packageVersionId`s the rollup should fan out across. For now
 * this returns a single sentinel `'*'` so the scheduler stays runnable in dev
 * without Postgres; a follow-up will swap this for a Prisma query against the
 * `package_versions` table filtered by `status = 'live'`.
 *
 * Exported so tests can stub or replace the discovery path.
 */
export type LivePackageVersionsLookup = () => Promise<string[]>;

let livePackageVersionsLookup: LivePackageVersionsLookup = async () => ['*'];

export function _setLivePackageVersionsLookupForTests(
  lookup: LivePackageVersionsLookup | null,
): void {
  livePackageVersionsLookup = lookup ?? (async () => ['*']);
}

function repeatJobId(
  cohort: ScheduledCohort,
  packageVersionId: string,
): string {
  return `branch-stats-rollup:${packageVersionId}:${cohort}`;
}

/**
 * Install (or re-install — idempotent) the recurring schedules.
 * Returns the descriptors that were registered, useful for boot-time logging.
 */
export async function installSchedules(
  connection: SchedulerConnection,
): Promise<InstalledSchedule[]> {
  const queue = await makeQueue(BRANCH_STATS_ROLLUP_QUEUE, connection);
  const packageVersionIds = await livePackageVersionsLookup();
  const installed: InstalledSchedule[] = [];

  try {
    for (const packageVersionId of packageVersionIds) {
      for (const cohort of SCHEDULED_BRANCH_STATS_COHORTS) {
        const jobId = repeatJobId(cohort, packageVersionId);
        const payload = buildBranchStatsPayload(cohort, packageVersionId);
        await queue.add(BRANCH_STATS_ROLLUP_QUEUE, payload, {
          jobId,
          repeat: { pattern: BRANCH_STATS_ROLLUP_CRON },
        });
        installed.push({
          queueName: BRANCH_STATS_ROLLUP_QUEUE,
          jobName: BRANCH_STATS_ROLLUP_QUEUE,
          jobId,
          pattern: BRANCH_STATS_ROLLUP_CRON,
        });
      }
    }
  } finally {
    await queue.close().catch(() => undefined);
  }

  return installed;
}

/**
 * Cancel every recurring job this scheduler installs. Used by integration
 * tests that need a clean Redis state between runs.
 */
export async function removeAllSchedules(
  connection: SchedulerConnection,
): Promise<number> {
  const queue = await makeQueue(BRANCH_STATS_ROLLUP_QUEUE, connection);
  const packageVersionIds = await livePackageVersionsLookup();
  let removed = 0;
  try {
    for (const packageVersionId of packageVersionIds) {
      for (const cohort of SCHEDULED_BRANCH_STATS_COHORTS) {
        const ok = await queue.removeRepeatable(
          BRANCH_STATS_ROLLUP_QUEUE,
          { pattern: BRANCH_STATS_ROLLUP_CRON },
          repeatJobId(cohort, packageVersionId),
        );
        if (ok) removed += 1;
      }
    }
  } finally {
    await queue.close().catch(() => undefined);
  }
  return removed;
}
