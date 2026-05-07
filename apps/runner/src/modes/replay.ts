import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import type { RunnerFixture } from '@researchcrafters/erp-schema';
import type { Sandbox } from '../sandbox.js';
import { runSandbox } from '../sandbox.js';
import type { RunArtifactsRaw, RunJob } from '../types.js';
import { parseCommand } from './test.js';

/**
 * `replay` mode: verify fixture sha256 hashes BEFORE execution. If any
 * fixture mismatches, refuse with a clear error. Then run the stage's command
 * in a CPU-only sandbox.
 */

export class FixtureMismatchError extends Error {
  constructor(
    public readonly fixturePath: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `replay fixture hash mismatch: ${fixturePath} expected sha256=${expected} got sha256=${actual}`,
    );
    this.name = 'FixtureMismatchError';
  }
}

export class FixtureMissingError extends Error {
  constructor(public readonly fixturePath: string) {
    super(`replay fixture missing: ${fixturePath}`);
    this.name = 'FixtureMissingError';
  }
}

export interface FixtureReader {
  /** Returns sha256 hex digest of the bytes at `path`. Throws if missing. */
  hashFile(path: string): Promise<string>;
}

/**
 * Default reader: reads from disk. Tests inject an in-memory reader so they
 * never touch the filesystem.
 */
export class FilesystemFixtureReader implements FixtureReader {
  constructor(private readonly rootDir: string) {}

  async hashFile(path: string): Promise<string> {
    const abs = isAbsolute(path) ? path : resolve(this.rootDir, path);
    let buf: Buffer;
    try {
      buf = await fs.readFile(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new FixtureMissingError(path);
      }
      throw err;
    }
    return createHash('sha256').update(buf).digest('hex');
  }
}

/**
 * Verifies every declared fixture's sha256 matches before execution. Throws
 * `FixtureMismatchError` or `FixtureMissingError` on the first failure so the
 * caller can surface a deterministic error to the learner UI.
 */
export async function verifyFixtures(
  fixtures: ReadonlyArray<RunnerFixture>,
  reader: FixtureReader,
): Promise<void> {
  for (const fx of fixtures) {
    const actual = await reader.hashFile(fx.path);
    if (actual !== fx.sha256) {
      throw new FixtureMismatchError(fx.path, fx.sha256, actual);
    }
  }
}

export interface ReplayModeDeps {
  sandbox: Sandbox;
  image: string;
  fixtureReader: FixtureReader;
}

export async function runReplayMode(
  job: RunJob,
  deps: ReplayModeDeps,
): Promise<RunArtifactsRaw> {
  // Hash check BEFORE any sandbox spin-up.
  const fixtures = job.runnerStage.fixtures ?? [];
  await verifyFixtures(fixtures, deps.fixtureReader);

  const start = Date.now();
  const result = await runSandbox(deps.sandbox, {
    image: deps.image,
    command: parseCommand(job.runnerStage.command),
    workspacePath: job.workspacePath,
    hostWorkspaceBundle: job.bundleUri,
    limits: {
      cpu: job.runnerStage.cpu ?? job.resources.cpu,
      memoryMb: job.runnerStage.memory_mb ?? job.resources.memory_mb,
      wallClockSeconds: job.runnerStage.wall_clock_seconds ?? job.resources.wall_clock_seconds,
      maxUploadBytes: 25 * 1024 * 1024,
    },
    // Replay is deterministic: never network, always CPU-only.
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
