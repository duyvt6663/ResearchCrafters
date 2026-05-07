import {
  BRANCH_STATS_ROLLUP_QUEUE,
  EVENT_DUAL_WRITE_QUEUE,
  SHARE_CARD_RENDER_QUEUE,
  SUBMISSION_RUN_QUEUE,
  type QueueName,
} from './queues.js';
import { getRedisConnection } from './redis.js';
import {
  installSchedules,
  type InstalledSchedule,
} from './scheduler.js';
import {
  runBranchStatsRollup,
  type BranchStatsRollupJob,
} from './jobs/branch-stats-rollup.js';
import {
  runShareCardRender,
  type ShareCardRenderJob,
} from './jobs/share-card-render.js';
import {
  runEventDualWrite,
  type EventDualWriteJob,
} from './jobs/event-dual-write.js';
import {
  runSubmissionRun,
  makeDefaultRunnerExecutor,
  type SubmissionRunJob,
} from './jobs/submission-run.js';

export * from './queues.js';
export * from './redis.js';
export {
  installSchedules,
  removeAllSchedules,
  BRANCH_STATS_ROLLUP_CRON,
  SCHEDULED_BRANCH_STATS_COHORTS,
  type InstalledSchedule,
  type SchedulerConnection,
  type ScheduledCohort,
} from './scheduler.js';
export {
  runBranchStatsRollup,
  aggregateTraversals,
  computePercent,
  roundToNearestFive,
  NODE_MIN_N,
  BRANCH_MIN_N,
  type BranchStatsRollupJob,
  type BranchStatsRollupResult,
  type BranchStatsCohort,
  type BranchStatsPrisma,
} from './jobs/branch-stats-rollup.js';
export {
  runShareCardRender,
  generatePublicSlug,
  type ShareCardRenderJob,
  type ShareCardRenderResult,
  type ShareCardPrisma,
  type SlugRng,
} from './jobs/share-card-render.js';
export {
  runEventDualWrite,
  type EventDualWriteJob,
  type EventDualWritePrisma,
} from './jobs/event-dual-write.js';
export {
  runSubmissionRun,
  makeDefaultRunnerExecutor,
  type SubmissionRunJob,
  type SubmissionRunResult,
  type SubmissionRunPrisma,
  type SubmissionRunDeps,
  type RunnerArtifacts,
  type RunnerExecutor,
  type RunnerExecutorInput,
  type GraderFn,
  type GradeRow,
  type RunLogLine,
  type RunnerMode,
  type ExecutionStatus,
  type RunStatus,
} from './jobs/submission-run.js';

interface BullWorker {
  close(): Promise<void>;
}

interface WorkerStartOpts {
  queueName: QueueName;
  concurrency: number;
  connection: Record<string, unknown>;
  processor: (data: unknown) => Promise<unknown>;
}

async function startBullWorker(opts: WorkerStartOpts): Promise<BullWorker> {
  const bullmq = (await import('bullmq')) as {
    Worker: new (
      name: string,
      processor: (job: { data: unknown }) => Promise<unknown>,
      options: { connection: Record<string, unknown>; concurrency: number },
    ) => BullWorker;
  };
  return new bullmq.Worker(
    opts.queueName,
    async (job) => opts.processor(job.data),
    {
      connection: opts.connection,
      concurrency: opts.concurrency,
    },
  );
}

export interface StartAllOptions {
  /** Override the queues to serve. Defaults to the three this app owns. */
  queues?: ReadonlyArray<QueueName>;
  concurrency?: number;
}

export async function startAllWorkers(
  opts: StartAllOptions = {},
): Promise<{ workers: BullWorker[]; shutdown: () => Promise<void> }> {
  const concurrency = opts.concurrency ?? Number(process.env['CONCURRENCY'] ?? 1);
  const queues =
    opts.queues ??
    ([
      BRANCH_STATS_ROLLUP_QUEUE,
      SHARE_CARD_RENDER_QUEUE,
      EVENT_DUAL_WRITE_QUEUE,
      SUBMISSION_RUN_QUEUE,
    ] as const);

  // Lazy import so unit tests can import this module without a live DB.
  const { prisma } = (await import('@researchcrafters/db')) as {
    prisma: unknown;
  };

  const redisOpts = getRedisConnection();
  const connection: Record<string, unknown> = {
    url: redisOpts.url,
    maxRetriesPerRequest: redisOpts.maxRetriesPerRequest,
  };
  const workers: BullWorker[] = [];

  // Install recurring schedules before mounting consumers so jobs that fire
  // immediately have a worker to pick them up.
  // Default-on outside test; default-off in tests so unit suites don't open
  // a real Redis socket on import.
  const scheduleEnvDefault =
    process.env['NODE_ENV'] === 'test' ? 'false' : 'true';
  const schedulesEnabled =
    (process.env['WORKER_SCHEDULES_ENABLED'] ?? scheduleEnvDefault) === 'true';
  let installed: InstalledSchedule[] = [];
  if (schedulesEnabled) {
    try {
      installed = await installSchedules(connection);
    } catch (err) {
       
      console.warn(
        JSON.stringify({
          kind: 'worker_schedule_install_failed',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  // Default executor for `submission_run`: stub-but-real path against the
  // seeded canonical solution. Production replaces this with a real
  // sandboxed dispatch once the worker can pull learner bundles from S3.
  const defaultRunnerExecutor = makeDefaultRunnerExecutor();

  for (const queueName of queues) {
    let processor: (data: unknown) => Promise<unknown>;
    switch (queueName) {
      case 'branch_stats_rollup':
        processor = (data) =>
          runBranchStatsRollup(
            data as BranchStatsRollupJob,
            prisma as never,
          );
        break;
      case 'share_card_render':
        processor = (data) =>
          runShareCardRender(data as ShareCardRenderJob, prisma as never);
        break;
      case 'event_dual_write':
        processor = (data) =>
          runEventDualWrite(data as EventDualWriteJob, prisma as never);
        break;
      case 'submission_run':
        processor = (data) =>
          runSubmissionRun(
            data as SubmissionRunJob,
            prisma as never,
            { runnerExecutor: defaultRunnerExecutor },
          );
        break;
      default:
        // Other queues (mentor_request, package_build) are owned elsewhere;
        // skip silently if they slip into the list.
        continue;
    }
    const worker = await startBullWorker({
      queueName,
      concurrency,
      connection,
      processor,
    });
    workers.push(worker);
  }

   
  console.log(
    JSON.stringify({
      kind: 'worker_started',
      queues,
      concurrency,
      schedulesEnabled,
      schedules: installed.map((s) => ({
        queue: s.queueName,
        jobId: s.jobId,
        pattern: s.pattern,
      })),
    }),
  );

  const shutdown = async (): Promise<void> => {
    await Promise.all(workers.map((w) => w.close().catch(() => undefined)));
  };

  return { workers, shutdown };
}

export async function main(): Promise<void> {
  const { shutdown } = await startAllWorkers();

  const onSignal = async (signal: NodeJS.Signals): Promise<void> => {
     
    console.log(JSON.stringify({ kind: 'worker_shutdown', signal }));
    await shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => void onSignal('SIGINT'));
  process.on('SIGTERM', () => void onSignal('SIGTERM'));
}

const isEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();
if (isEntry) {
  void main();
}
