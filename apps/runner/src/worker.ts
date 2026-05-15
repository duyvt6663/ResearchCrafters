import type { Sandbox } from './sandbox.js';
import type { FixtureReader } from './modes/replay.js';
import { runTestMode } from './modes/test.js';
import { runReplayMode } from './modes/replay.js';
import { runMiniExperimentMode } from './modes/mini-experiment.js';
import type { RunJob, RunResult } from './types.js';
import {
  appLogger as defaultAppLogger,
  NoopRunnerOutputSink,
  persistSubmissionOutput,
  type AppLogger,
  type RunnerOutputSink,
} from './logger.js';

/**
 * Worker dispatches a queue job to the right mode handler. The actual BullMQ
 * binding lives in `index.ts`; this module is queue-agnostic so the same code
 * is exercised by tests via direct invocation.
 */
export interface WorkerDeps {
  sandbox: Sandbox;
  /** Image per mode. Production reads these from infra/docker manifests. */
  images: { test: string; replay: string; miniExperiment: string };
  fixtureReader: FixtureReader;
  /** Operational logger. Defaults to process.stderr JSON logger. */
  appLogger?: AppLogger;
  /** Sink for captured submission stdout/stderr. Defaults to noop. */
  outputSink?: RunnerOutputSink;
}

export async function handleJob(job: RunJob, deps: WorkerDeps): Promise<RunResult> {
  const logger = deps.appLogger ?? defaultAppLogger;
  const sink = deps.outputSink ?? new NoopRunnerOutputSink();

  logger.info('job.start', { jobId: job.jobId });

  let artifacts: RunResult['artifacts'];
  switch (job.mode) {
    case 'test': {
      artifacts = await runTestMode(job, {
        sandbox: deps.sandbox,
        image: deps.images.test,
      });
      break;
    }
    case 'replay': {
      artifacts = await runReplayMode(job, {
        sandbox: deps.sandbox,
        image: deps.images.replay,
        fixtureReader: deps.fixtureReader,
      });
      break;
    }
    case 'mini_experiment': {
      artifacts = await runMiniExperimentMode(job, {
        sandbox: deps.sandbox,
        image: deps.images.miniExperiment,
      });
      break;
    }
  }

  await persistSubmissionOutput(sink, job.jobId, artifacts);
  logger.info('job.complete', { jobId: job.jobId });

  return { jobId: job.jobId, submissionId: job.submissionId, stageId: job.stageId, artifacts };
}

/**
 * Placeholder BullMQ wiring. The real worker imports `Worker` from `bullmq`
 * and binds `handleJob` as the processor. Tests bypass this and call
 * `handleJob` directly.
 *
 * The `bullmq` import is dynamic so unit tests can run without a Redis
 * connection.
 */
export interface StartWorkerOpts {
  queueName: string;
  /** ConnectionOptions for ioredis — passthrough to bullmq. */
  connection: Record<string, unknown>;
  deps: WorkerDeps;
}

export async function startWorker(opts: StartWorkerOpts): Promise<{
  /** Stops the worker and closes the queue connection. */
  close: () => Promise<void>;
}> {
  // Dynamic import keeps bullmq off the test path.
  const bullmq = (await import('bullmq')) as { Worker: new (...args: unknown[]) => { close: () => Promise<void> } };
  const worker = new bullmq.Worker(
    opts.queueName,
    async (job: { data: unknown }) => handleJob(job.data as RunJob, opts.deps),
    { connection: opts.connection },
  );
  return {
    close: async () => {
      await worker.close();
    },
  };
}
