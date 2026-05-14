import type { Sandbox } from '../sandbox.js';
import { runSandbox } from '../sandbox.js';
import {
  LocalFsSandbox,
  MAX_LOCAL_FS_CPU,
  MAX_LOCAL_FS_MEMORY_MB,
} from '../sandboxes/local-fs.js';
import type { RunArtifactsRaw, RunJob } from '../types.js';
import { parseCommand } from './test.js';

/**
 * `mini_experiment` mode: like `test` but with stricter CPU/memory caps and
 * CPU-only enforcement. GPU requests are explicitly rejected for MVP.
 */

const MAX_MINI_EXPERIMENT_CPU = 4;
const MAX_MINI_EXPERIMENT_MEMORY_MB = 4096;
const MAX_MINI_EXPERIMENT_WALL_SECONDS = 120;

export class GpuNotAvailableError extends Error {
  constructor(public readonly stageId: string) {
    super(
      `GPU not available for mini_experiment stage ${stageId}. MVP runner is CPU-only; see backlog/03.`,
    );
    this.name = 'GpuNotAvailableError';
  }
}

export class MiniExperimentResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MiniExperimentResourceError';
  }
}

export interface MiniExperimentDeps {
  sandbox: Sandbox;
  image: string;
}

export interface MiniExperimentRunOpts {
  /** True if `runner.yaml` (or stage config) requested GPU. */
  gpuRequested?: boolean;
}

export async function runMiniExperimentMode(
  job: RunJob,
  deps: MiniExperimentDeps,
  opts: MiniExperimentRunOpts = {},
): Promise<RunArtifactsRaw> {
  if (opts.gpuRequested) {
    throw new GpuNotAvailableError(job.stageId);
  }

  const requestedCpu = job.runnerStage.cpu ?? job.resources.cpu;
  const requestedMemoryMb = job.runnerStage.memory_mb ?? job.resources.memory_mb;

  // When the dev-only LocalFsSandbox is in play, refuse anything beyond its
  // documented caps. Production (DockerSandbox) gets the looser MVP limits.
  if (deps.sandbox instanceof LocalFsSandbox) {
    if (requestedCpu > MAX_LOCAL_FS_CPU) {
      throw new MiniExperimentResourceError(
        `mini_experiment requested cpu=${requestedCpu} but LocalFsSandbox max is ${MAX_LOCAL_FS_CPU}`,
      );
    }
    if (requestedMemoryMb > MAX_LOCAL_FS_MEMORY_MB) {
      throw new MiniExperimentResourceError(
        `mini_experiment requested memoryMb=${requestedMemoryMb} but LocalFsSandbox max is ${MAX_LOCAL_FS_MEMORY_MB}`,
      );
    }
  }

  const cpu = Math.min(requestedCpu, MAX_MINI_EXPERIMENT_CPU);
  const memoryMb = Math.min(requestedMemoryMb, MAX_MINI_EXPERIMENT_MEMORY_MB);
  const wallClockSeconds = Math.min(
    job.runnerStage.wall_clock_seconds ?? job.resources.wall_clock_seconds,
    MAX_MINI_EXPERIMENT_WALL_SECONDS,
  );

  const start = Date.now();
  const result = await runSandbox(deps.sandbox, {
    image: deps.image,
    command: parseCommand(job.runnerStage.command),
    workspacePath: job.workspacePath,
    hostWorkspaceBundle: job.bundleUri,
    limits: {
      cpu,
      memoryMb,
      wallClockSeconds,
      maxUploadBytes: 25 * 1024 * 1024,
    },
    network: 'none',
    readOnlyRootfs: true,
  });
  return {
    executionStatus: result.executionStatus,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: Date.now() - start,
    ...(result.exitReason.kind === 'nonzero_exit'
      ? { exitCode: result.exitReason.code }
      : {}),
  };
}
