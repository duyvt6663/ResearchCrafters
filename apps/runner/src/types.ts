import type { ExecutionStatus } from '@researchcrafters/evaluator-sdk';
import type { RunnerStage, RunnerResources } from '@researchcrafters/erp-schema';

export type { ExecutionStatus };

export type RunnerMode = 'test' | 'replay' | 'mini_experiment';

export interface RunJob {
  jobId: string;
  submissionId: string;
  stageId: string;
  packageVersionId: string;
  /** Mode requested by `runner.yaml` for this stage. */
  mode: RunnerMode;
  /** Pointer to the submission bundle in object storage. */
  bundleUri: string;
  /** Workspace mount point inside the container. */
  workspacePath: string;
  /** Resolved runner stage config from runner.yaml. */
  runnerStage: RunnerStage;
  /** Resolved global resource caps. */
  resources: RunnerResources;
  /** User id for rate limiting and log tagging. */
  userId: string;
}

export interface RunArtifactsRaw {
  executionStatus: ExecutionStatus;
  /** Stdout/stderr captures, post-scrub. */
  stdout: string;
  stderr: string;
  /** Exit code from the sandbox process. */
  exitCode?: number;
  /** Duration in ms. */
  durationMs: number;
  /** Files emitted by the runner stage. */
  outputs?: Readonly<Record<string, string>>;
}

/**
 * Result handed back to the queue / web app. Production code persists this and
 * hands it to the evaluator only when `executionStatus === 'ok'`.
 */
export interface RunResult {
  jobId: string;
  submissionId: string;
  stageId: string;
  artifacts: RunArtifactsRaw;
}
