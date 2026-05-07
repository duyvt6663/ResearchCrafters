import type { Sandbox } from '../sandbox.js';
import { runSandbox } from '../sandbox.js';
import type { RunJob, RunArtifactsRaw } from '../types.js';

/**
 * `test` mode: deterministic unit/integration tests on the learner submission.
 * Runs the stage's declared command in a sandbox, captures stdout/stderr,
 * returns `{ executionStatus, artifacts }`.
 */
export interface TestModeDeps {
  sandbox: Sandbox;
  /** Image to run the test command in (e.g. python:3.11-slim digest). */
  image: string;
}

export async function runTestMode(
  job: RunJob,
  deps: TestModeDeps,
): Promise<RunArtifactsRaw> {
  const start = Date.now();
  const cmd = parseCommand(job.runnerStage.command);
  const result = await runSandbox(deps.sandbox, {
    image: deps.image,
    command: cmd,
    workspacePath: job.workspacePath,
    hostWorkspaceBundle: job.bundleUri,
    limits: {
      cpu: job.runnerStage.cpu ?? job.resources.cpu,
      memoryMb: job.runnerStage.memory_mb ?? job.resources.memory_mb,
      wallClockSeconds: job.runnerStage.wall_clock_seconds ?? job.resources.wall_clock_seconds,
      maxUploadBytes: 25 * 1024 * 1024,
    },
    network: 'none', // test mode is always offline
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

/**
 * Parse a `runner.yaml` command into argv. Authors may write either a single
 * string ("pytest -q tests") or an array form (`['pytest', '-q', 'tests']`).
 * `runner.yaml` schema also allows `command` to be omitted for `mode: 'none'`
 * stages — modes that do call `parseCommand` are responsible for upstream
 * validation, so we throw if we see `undefined` here.
 */
export function parseCommand(cmd: string | readonly string[] | undefined): string[] {
  if (cmd === undefined) {
    throw new Error('parseCommand: command is required for this runner mode');
  }
  if (Array.isArray(cmd)) {
    return cmd.filter((p) => p.length > 0);
  }
  return (cmd as string)
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
}
