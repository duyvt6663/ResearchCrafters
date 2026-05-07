import type { Sandbox } from './sandbox.js';
import type { FixtureReader } from './modes/replay.js';
import { runTestMode } from './modes/test.js';
import { runReplayMode } from './modes/replay.js';
import { runMiniExperimentMode } from './modes/mini-experiment.js';
import type { RunJob, RunResult } from './types.js';

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
}

export async function handleJob(job: RunJob, deps: WorkerDeps): Promise<RunResult> {
  switch (job.mode) {
    case 'test': {
      const artifacts = await runTestMode(job, {
        sandbox: deps.sandbox,
        image: deps.images.test,
      });
      return { jobId: job.jobId, submissionId: job.submissionId, stageId: job.stageId, artifacts };
    }
    case 'replay': {
      const artifacts = await runReplayMode(job, {
        sandbox: deps.sandbox,
        image: deps.images.replay,
        fixtureReader: deps.fixtureReader,
      });
      return { jobId: job.jobId, submissionId: job.submissionId, stageId: job.stageId, artifacts };
    }
    case 'mini_experiment': {
      const artifacts = await runMiniExperimentMode(job, {
        sandbox: deps.sandbox,
        image: deps.images.miniExperiment,
      });
      return { jobId: job.jobId, submissionId: job.submissionId, stageId: job.stageId, artifacts };
    }
  }
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
