// Submission-run worker job.
//
// Drives the submission -> runner -> evaluator -> grade lifecycle:
//
//   1. Pick a Run row out of `queued` and mark it `running`.
//   2. Hand off to the appropriate runner mode (`test | replay | mini_experiment | none`)
//      via an injected executor. `none` short-circuits to `executionStatus: 'ok'`
//      with empty artifacts.
//   3. Persist `executionStatus`, the captured log lines, and any metrics back
//      onto the Run row (logs go inline into `Run.metricsJson.logs`; production
//      wires them out to S3 NDJSON under `runs/<runId>/logs.ndjson` once the
//      worker has S3 creds).
//   4. On `executionStatus === 'ok'`, call into evaluator-sdk's `gradeAttempt`
//      to produce a Grade row (idempotent on
//      `(submissionId, rubricVersion, evaluatorVersion)`).
//
// The job is intentionally queue-agnostic: the BullMQ binding lives in
// `apps/worker/src/index.ts`. This module is exercised directly by tests via
// `runSubmissionRun(job, prisma, deps)`.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// -----------------------------------------------------------------------------
// Public payload + dep types
// -----------------------------------------------------------------------------

export type RunnerMode = 'test' | 'replay' | 'mini_experiment' | 'none';

export type ExecutionStatus =
  | 'ok'
  | 'timeout'
  | 'oom'
  | 'crash'
  | 'exit_nonzero';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'ok'
  | 'timeout'
  | 'oom'
  | 'crash'
  | 'exit_nonzero';

/**
 * Payload enqueued by `POST /api/submissions/[id]/finalize`. The producer side
 * stamps the BullMQ `jobId` to `runId` for idempotency, so retrying the
 * enqueue is safe — the second add() is a no-op against the same Redis stream.
 */
export interface SubmissionRunJob {
  runId: string;
  submissionId: string;
  packageVersionId: string;
  /** YAML stage id (e.g. "S004"). */
  stageRef: string;
  runnerMode: RunnerMode;
}

export interface SubmissionRunResult {
  runId: string;
  status: RunStatus;
  executionStatus: ExecutionStatus;
  /** Set when grading actually ran (executionStatus === 'ok' + rubric in scope). */
  gradeId?: string;
  /** Set when grading was skipped (e.g. executionStatus !== 'ok' or no rubric). */
  gradedSkipped?: boolean;
  /** Set when the runner mode short-circuited because mode === 'none'. */
  shortCircuited?: boolean;
}

// -----------------------------------------------------------------------------
// Runner executor contract
// -----------------------------------------------------------------------------

/**
 * Captured runner log line. Matches the shape the web `/api/runs/:id/logs`
 * route reads out of `Run.metricsJson.logs`.
 */
export interface RunLogLine {
  ts: string; // ISO 8601
  severity: 'debug' | 'info' | 'warn' | 'error';
  text: string;
}

/**
 * Output of a runner invocation. The shape mirrors `RunArtifactsRaw` in
 * `apps/runner/src/types.ts` — we redeclare it here so the worker doesn't need
 * a workspace dep on `@researchcrafters/runner` (which would drag in dockerode
 * and the runner's tighter zod surface).
 */
export interface RunnerArtifacts {
  executionStatus: ExecutionStatus;
  logs: ReadonlyArray<RunLogLine>;
  metrics?: Readonly<Record<string, number>>;
  /** Free-form pointer map (e.g. result_json: ".../S003.json"). */
  artifactPointers?: Readonly<Record<string, string>>;
  /** Test results parsed by the runner mode handler. */
  testResults?: ReadonlyArray<{ name: string; passed: boolean; message?: string }>;
  /** Total wall-clock duration in milliseconds. */
  durationMs?: number;
  /** Optional non-zero exit code, if applicable. */
  exitCode?: number;
}

export interface RunnerExecutorInput {
  runnerMode: Exclude<RunnerMode, 'none'>;
  packageVersionId: string;
  submissionId: string;
  stageRef: string;
  runId: string;
  /** Stage policy mirrored on the Stage row (runner config lives inside). */
  stagePolicy: unknown;
}

/**
 * Pluggable runner executor. Production wires this to the canonical-solution
 * dispatch path (LocalFsSandbox + the runner's mode handlers). Tests inject a
 * deterministic stub that returns a fixed `RunnerArtifacts`.
 */
export type RunnerExecutor = (
  input: RunnerExecutorInput,
) => Promise<RunnerArtifacts>;

// -----------------------------------------------------------------------------
// Grade store contract
// -----------------------------------------------------------------------------

export interface GradeRow {
  id: string;
  stageAttemptId: string;
  submissionId: string;
  rubricVersion: string;
  evaluatorVersion: string;
  passed: boolean;
  score: number | null;
  dimensions: unknown;
  evidenceRefs: unknown;
  modelMeta: unknown;
}

/**
 * Pluggable grader. Production wires this to evaluator-sdk's `gradeAttempt`
 * via a Prisma-backed `GradeStore`. Tests inject a deterministic stub.
 */
export type GraderFn = (input: {
  runId: string;
  submissionId: string;
  stageAttemptId: string;
  stageRef: string;
  packageVersionId: string;
  rubricVersion: string;
  artifacts: RunnerArtifacts;
  passThreshold: number | null;
}) => Promise<GradeRow | null>;

// -----------------------------------------------------------------------------
// Prisma surface
// -----------------------------------------------------------------------------

interface RunRow {
  id: string;
  status: string;
  runnerMode: string;
  metricsJson: unknown;
  submissionId: string;
}

interface SubmissionRow {
  id: string;
  stageAttemptId: string;
  bundleObjectKey: string;
  bundleSha: string;
  stageAttempt: {
    id: string;
    stageRef: string;
    enrollment: { packageVersionId: string };
  };
}

interface StageRow {
  id: string;
  stageId: string;
  runnerMode: string;
  rubricRef: string | null;
  passThreshold: number | null;
  stagePolicy: unknown;
}

export interface SubmissionRunPrisma {
  run: {
    findUnique(args: { where: { id: string } }): Promise<RunRow | null>;
    update(args: {
      where: { id: string };
      data: {
        status?: string;
        runnerMode?: string;
        startedAt?: Date;
        finishedAt?: Date;
        metricsJson?: unknown;
        logObjectKey?: string | null;
      };
    }): Promise<unknown>;
  };
  submission: {
    findUnique(args: {
      where: { id: string };
      select?: unknown;
    }): Promise<SubmissionRow | null>;
  };
  stage: {
    findFirst(args: {
      where: { packageVersionId: string; stageId: string };
    }): Promise<StageRow | null>;
  };
  stageAttempt: {
    update(args: {
      where: { id: string };
      data: {
        executionStatus?: string;
        gradeId?: string | null;
        passed?: boolean;
        score?: number | null;
      };
    }): Promise<unknown>;
  };
}

// -----------------------------------------------------------------------------
// Deps + processor
// -----------------------------------------------------------------------------

export interface SubmissionRunDeps {
  /** Pluggable runner. Tests inject a stub; production injects the real runner. */
  runnerExecutor: RunnerExecutor;
  /** Pluggable grader. Tests inject a stub; production wires evaluator-sdk. */
  grader?: GraderFn;
  /** ISO clock; tests inject. */
  now?: () => Date;
  /**
   * Optional NDJSON log writer. When set, the worker writes each captured log
   * line to disk under `<dir>/runs/<runId>/logs.ndjson`. Set to `null` to
   * disable. Production wires this to an S3-backed writer once worker has
   * S3 creds. Defaults to an in-memory buffer (no disk write).
   */
  ndjsonLogDir?: string | null;
  /**
   * Optional logger. Defaults to console. Tests pass a sink for assertions.
   */
  log?: (kind: string, payload: Record<string, unknown>) => void;
}

const RUNNER_VERSION = '0.1.0';

function isTerminalExecution(status: ExecutionStatus): boolean {
  // All execution-status values are terminal — the run is finished once it
  // produces any of them. We name the helper for symmetry with the route
  // handler that gates `finishedAt` on the same set.
  return (
    status === 'ok' ||
    status === 'timeout' ||
    status === 'oom' ||
    status === 'crash' ||
    status === 'exit_nonzero'
  );
}

function executionToRunStatus(execution: ExecutionStatus): RunStatus {
  // The Run row's `status` column collapses execution outcomes 1:1; the only
  // non-terminal Run status (`queued`, `running`) is set explicitly by the
  // worker before/after dispatch.
  return execution;
}

/**
 * Process one submission_run job. The function is pure-ish: it talks to
 * Prisma + the injected executor + grader and returns a small summary.
 *
 * Errors during execution are caught and translated to `executionStatus: 'crash'`
 * so the Run row never gets stuck in `running` — failure to update Prisma is
 * the only path that bubbles up.
 */
export async function runSubmissionRun(
  job: SubmissionRunJob,
  prisma: SubmissionRunPrisma,
  deps: SubmissionRunDeps,
): Promise<SubmissionRunResult> {
  const now = deps.now ?? (() => new Date());
  const log =
    deps.log ??
    ((kind: string, payload: Record<string, unknown>) => {

      console.log(JSON.stringify({ kind, ...payload }));
    });

  // 1. Mark running.
  await prisma.run.update({
    where: { id: job.runId },
    data: {
      status: 'running',
      runnerMode: job.runnerMode,
      startedAt: now(),
    },
  });

  // 2. Fetch submission + stage. Submission carries the stage attempt FK we
  //    update on the way out; Stage carries the rubric ref + pass threshold.
  const submission = await prisma.submission.findUnique({
    where: { id: job.submissionId },
    select: {
      id: true,
      stageAttemptId: true,
      bundleObjectKey: true,
      bundleSha: true,
      stageAttempt: {
        select: {
          id: true,
          stageRef: true,
          enrollment: { select: { packageVersionId: true } },
        },
      },
    },
  });
  if (!submission) {
    await failRun(prisma, job.runId, 'crash', now);
    log('submission_run_missing_submission', { runId: job.runId, submissionId: job.submissionId });
    return {
      runId: job.runId,
      status: 'crash',
      executionStatus: 'crash',
      gradedSkipped: true,
    };
  }

  const stage = await prisma.stage.findFirst({
    where: {
      packageVersionId: job.packageVersionId,
      stageId: job.stageRef,
    },
  });

  // 3. Dispatch to the runner mode.
  let artifacts: RunnerArtifacts;
  if (job.runnerMode === 'none') {
    artifacts = {
      executionStatus: 'ok',
      logs: [
        {
          ts: now().toISOString(),
          severity: 'info',
          text: `Stage ${job.stageRef}: runner mode=none, skipping execution.`,
        },
      ],
      durationMs: 0,
    };
  } else {
    try {
      artifacts = await deps.runnerExecutor({
        runnerMode: job.runnerMode,
        packageVersionId: job.packageVersionId,
        submissionId: job.submissionId,
        stageRef: job.stageRef,
        runId: job.runId,
        stagePolicy: stage?.stagePolicy ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('submission_run_executor_failed', { runId: job.runId, error: message });
      artifacts = {
        executionStatus: 'crash',
        logs: [
          {
            ts: now().toISOString(),
            severity: 'error',
            text: `Runner crashed: ${message}`,
          },
        ],
        durationMs: 0,
      };
    }
  }

  // 4. Persist log lines + metrics to Run.metricsJson and final status to Run.status.
  let logObjectKey: string | null = null;
  if (deps.ndjsonLogDir) {
    try {
      logObjectKey = await writeNdjsonLogs(deps.ndjsonLogDir, job.runId, artifacts.logs);
    } catch (err) {
      // Disk-write failure should not fail the run — we still have the inline
      // copy on `Run.metricsJson.logs`.
      log('submission_run_ndjson_write_failed', {
        runId: job.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const metricsBody: Record<string, unknown> = {
    logs: artifacts.logs,
    runnerVersion: RUNNER_VERSION,
  };
  if (artifacts.metrics) metricsBody['metrics'] = artifacts.metrics;
  if (artifacts.testResults) metricsBody['testResults'] = artifacts.testResults;
  if (artifacts.artifactPointers) {
    metricsBody['artifactPointers'] = artifacts.artifactPointers;
  }
  if (typeof artifacts.durationMs === 'number') {
    metricsBody['durationMs'] = artifacts.durationMs;
  }
  if (typeof artifacts.exitCode === 'number') {
    metricsBody['exitCode'] = artifacts.exitCode;
  }

  await prisma.run.update({
    where: { id: job.runId },
    data: {
      status: executionToRunStatus(artifacts.executionStatus),
      metricsJson: metricsBody,
      ...(isTerminalExecution(artifacts.executionStatus)
        ? { finishedAt: now() }
        : {}),
      ...(logObjectKey ? { logObjectKey } : {}),
    },
  });

  // 5. Mirror executionStatus on the StageAttempt for fast lookups.
  await prisma.stageAttempt.update({
    where: { id: submission.stageAttempt.id },
    data: { executionStatus: artifacts.executionStatus },
  });

  // 6. Grade only when execution succeeded AND we have a rubric reference.
  if (artifacts.executionStatus !== 'ok') {
    log('submission_run_grade_skipped_execution', {
      runId: job.runId,
      executionStatus: artifacts.executionStatus,
    });
    return {
      runId: job.runId,
      status: executionToRunStatus(artifacts.executionStatus),
      executionStatus: artifacts.executionStatus,
      gradedSkipped: true,
      ...(job.runnerMode === 'none' ? { shortCircuited: true } : {}),
    };
  }

  if (!deps.grader || !stage?.rubricRef) {
    log('submission_run_grade_skipped_norubric', {
      runId: job.runId,
      hasGrader: Boolean(deps.grader),
      hasRubricRef: Boolean(stage?.rubricRef),
    });
    return {
      runId: job.runId,
      status: 'ok',
      executionStatus: 'ok',
      gradedSkipped: true,
      ...(job.runnerMode === 'none' ? { shortCircuited: true } : {}),
    };
  }

  const grade = await deps.grader({
    runId: job.runId,
    submissionId: submission.id,
    stageAttemptId: submission.stageAttempt.id,
    stageRef: submission.stageAttempt.stageRef,
    packageVersionId: submission.stageAttempt.enrollment.packageVersionId,
    rubricVersion: stage.rubricRef,
    artifacts,
    passThreshold: stage.passThreshold,
  });

  if (grade) {
    await prisma.stageAttempt.update({
      where: { id: submission.stageAttempt.id },
      data: {
        gradeId: grade.id,
        passed: grade.passed,
        score: grade.score,
      },
    });
    return {
      runId: job.runId,
      status: 'ok',
      executionStatus: 'ok',
      gradeId: grade.id,
      ...(job.runnerMode === 'none' ? { shortCircuited: true } : {}),
    };
  }

  return {
    runId: job.runId,
    status: 'ok',
    executionStatus: 'ok',
    gradedSkipped: true,
    ...(job.runnerMode === 'none' ? { shortCircuited: true } : {}),
  };
}

async function failRun(
  prisma: SubmissionRunPrisma,
  runId: string,
  status: RunStatus,
  now: () => Date,
): Promise<void> {
  await prisma.run.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: now(),
    },
  });
}

async function writeNdjsonLogs(
  dir: string,
  runId: string,
  logs: ReadonlyArray<RunLogLine>,
): Promise<string> {
  const outDir = join(dir, 'runs', runId);
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, 'logs.ndjson');
  const body = logs.map((l) => JSON.stringify(l)).join('\n');
  await writeFile(path, body, { encoding: 'utf-8' });
  // The web/runs/<id>/logs route honours `Run.logObjectKey` as a relative S3
  // key under the runs bucket. In dev we mirror the same naming on disk so
  // the contract is observable end-to-end without S3.
  return `runs/${runId}/logs.ndjson`;
}

// -----------------------------------------------------------------------------
// Default executor: stub-but-real path against canonical solutions.
// -----------------------------------------------------------------------------

/**
 * Build a default executor that runs against the seeded canonical solution
 * under `content/packages/<slug>/solutions/canonical/`. Production replaces
 * this with the real per-submission path once the runner can pull a learner
 * bundle from S3; the canonical path is enough to exercise the runner-loop
 * during development.
 *
 * The default behaviour:
 *   - `mode: 'none'` is handled by `runSubmissionRun` directly; this executor
 *     is only invoked for `test | replay | mini_experiment`.
 *   - For now we synthesize an `executionStatus: 'ok'` artifact with a single
 *     log line. The real wiring lands once the worker picks up a sandbox
 *     handle. Leaving the synthetic path here means the rest of the lifecycle
 *     (Run row update, StageAttempt update, Grade row) is exercised end-to-end.
 */
export function makeDefaultRunnerExecutor(opts: {
  /** ISO clock. */
  now?: () => Date;
} = {}): RunnerExecutor {
  const now = opts.now ?? (() => new Date());
  return async (input) => {
    const ts = now().toISOString();
    return {
      executionStatus: 'ok',
      logs: [
        {
          ts,
          severity: 'info',
          text: `runner=stub mode=${input.runnerMode} stage=${input.stageRef} runId=${input.runId}`,
        },
        {
          ts,
          severity: 'info',
          text: 'canonical-solution path: replace with sandboxed execution against the submitted bundle',
        },
      ],
      durationMs: 0,
      metrics: { canonical_solution: 1 },
    };
  };
}
