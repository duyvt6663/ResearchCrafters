import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  resolve,
  sep,
} from 'node:path';
import type { Sandbox, SandboxRunOpts, SandboxRunResult } from '../sandbox.js';
import type { SandboxExitReason } from '../execution-status.js';
import { mapExitReason } from '../execution-status.js';
import { isPathInside, stripSecretsFromEnv } from '../security.js';
import { scrubLogs } from '../log-scrub.js';

/**
 * Dev-only filesystem sandbox.
 *
 * SAFETY POSTURE
 * --------------
 * - **No network isolation.** POSIX child processes inherit the parent's
 *   network namespace and Node has no portable way to drop them. To prevent
 *   accidental egress this adapter REFUSES any opts where `network !== 'none'`
 *   — production must use a real container runtime.
 * - **Memory cap is best-effort.** There is no portable cgroup hook from
 *   Node; we cap requested `memoryMb` at {@link MAX_LOCAL_FS_MEMORY_MB} and
 *   surface anything over that as a typed error.
 * - **Path traversal protection.** Workspace files are copied from the
 *   declared `hostWorkspaceBundle` into a fresh tempdir under
 *   `os.tmpdir()/researchcrafters-sandbox/<run-id>/`. Any path containing
 *   `..`, an absolute segment, a non-portable separator, or a symlink is
 *   rejected before any byte is written.
 * - **Tempdir auto-cleanup.** The tempdir is removed in a `finally` block
 *   regardless of how the run ended.
 * - **Stripped env.** The caller-supplied env is unioned with the safe-env
 *   subset and re-stripped via {@link stripSecretsFromEnv}.
 * - **Wall-clock cap via SIGKILL.** An `AbortController` arms a kill timer at
 *   `wallClockSeconds * 1000` ms. Timeout returns `executionStatus: 'timeout'`.
 * - **Output cap.** Stdout and stderr are buffered with a hard cap
 *   ({@link DEFAULT_MAX_BUFFER_BYTES}). Excess is truncated and tagged.
 *
 * NOT FOR PRODUCTION. Production must run via `DockerSandbox` (or successor)
 * once that is implemented.
 */

/** Hard cap on requested memory. The local-fs adapter cannot enforce it. */
export const MAX_LOCAL_FS_MEMORY_MB = 1024;

/** Hard cap on requested CPU. Local fs is single-host; we refuse anything wild. */
export const MAX_LOCAL_FS_CPU = 4;

/** Default per-stream byte cap (5 MB) before captured logs are truncated. */
export const DEFAULT_MAX_BUFFER_BYTES = 5 * 1024 * 1024;

export class LocalFsSandboxConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalFsSandboxConfigError';
  }
}

export class LocalFsSandboxPathError extends Error {
  constructor(public readonly offendingPath: string, reason: string) {
    super(`LocalFsSandbox: refusing workspace entry "${offendingPath}": ${reason}`);
    this.name = 'LocalFsSandboxPathError';
  }
}

export interface LocalFsSandboxOptions {
  /** Max bytes captured per output stream. Defaults to 5 MB. */
  maxBufferBytes?: number;
  /**
   * Optional callback fired for every line read from stdout/stderr after
   * scrubbing. Mirrors the shape the future Docker adapter will surface.
   */
  onLogLine?: (entry: { stream: 'stdout' | 'stderr'; line: string }) => void;
  /**
   * Override the tempdir base. Tests use this to assert cleanup. Production
   * paths should leave it unset so we land under `os.tmpdir()`.
   */
  baseDir?: string;
}

export class LocalFsSandbox implements Sandbox {
  private readonly maxBufferBytes: number;
  private readonly onLogLine: ((entry: { stream: 'stdout' | 'stderr'; line: string }) => void) | undefined;
  private readonly baseDir: string;

  constructor(opts: LocalFsSandboxOptions = {}) {
    this.maxBufferBytes = opts.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
    this.onLogLine = opts.onLogLine;
    this.baseDir = opts.baseDir ?? join(tmpdir(), 'researchcrafters-sandbox');
  }

  async run(opts: SandboxRunOpts): Promise<SandboxRunResult> {
    if (opts.network !== 'none') {
      throw new LocalFsSandboxConfigError(
        `LocalFsSandbox refuses network policy "${opts.network}". The dev adapter has no real network isolation; only "none" is permitted.`,
      );
    }
    if (opts.limits.memoryMb > MAX_LOCAL_FS_MEMORY_MB) {
      throw new LocalFsSandboxConfigError(
        `LocalFsSandbox refuses memoryMb=${opts.limits.memoryMb} (max ${MAX_LOCAL_FS_MEMORY_MB}). Use DockerSandbox for higher memory budgets.`,
      );
    }
    if (opts.limits.cpu > MAX_LOCAL_FS_CPU) {
      throw new LocalFsSandboxConfigError(
        `LocalFsSandbox refuses cpu=${opts.limits.cpu} (max ${MAX_LOCAL_FS_CPU}). Use DockerSandbox for higher CPU budgets.`,
      );
    }
    if (opts.command.length === 0) {
      throw new LocalFsSandboxConfigError('LocalFsSandbox: command is empty');
    }

    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    const runId = randomUUID();
    const workdir = join(this.baseDir, runId);
    await fs.mkdir(workdir, { recursive: true, mode: 0o700 });

    const start = Date.now();
    try {
      // Copy the bundle into the tempdir, applying anti-traversal checks.
      if (opts.hostWorkspaceBundle) {
        await copyBundleSafely(opts.hostWorkspaceBundle, workdir);
      }

      const env = {
        ...stripSecretsFromEnv(process.env),
        ...stripSecretsFromEnv(opts.env ?? {}),
      };

      return await this.spawnAndCapture({
        cmd: opts.command,
        cwd: workdir,
        env,
        wallClockMs: opts.limits.wallClockSeconds * 1000,
        startTimestamp: start,
      });
    } finally {
      await fs.rm(workdir, { recursive: true, force: true }).catch(() => {
        // Cleanup is best-effort.
      });
    }
  }

  private async spawnAndCapture(args: {
    cmd: string[];
    cwd: string;
    env: Record<string, string>;
    wallClockMs: number;
    startTimestamp: number;
  }): Promise<SandboxRunResult> {
    const [head, ...rest] = args.cmd;
    if (typeof head !== 'string') {
      throw new LocalFsSandboxConfigError('LocalFsSandbox: command head is not a string');
    }
    const controller = new AbortController();
    let timedOut = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, args.wallClockMs);
    killTimer.unref();

    const child = spawn(head, rest, {
      cwd: args.cwd,
      env: args.env,
      signal: controller.signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;

    const drainStream = (
      stream: NodeJS.ReadableStream,
      target: 'stdout' | 'stderr',
    ): void => {
      let lineBuf = '';
      stream.on('data', (chunk: Buffer) => {
        if (target === 'stdout') {
          if (stdoutBytes + chunk.length > this.maxBufferBytes) {
            const remaining = Math.max(0, this.maxBufferBytes - stdoutBytes);
            if (remaining > 0) stdoutChunks.push(chunk.subarray(0, remaining));
            stdoutBytes = this.maxBufferBytes;
            stdoutTruncated = true;
          } else {
            stdoutChunks.push(chunk);
            stdoutBytes += chunk.length;
          }
        } else {
          if (stderrBytes + chunk.length > this.maxBufferBytes) {
            const remaining = Math.max(0, this.maxBufferBytes - stderrBytes);
            if (remaining > 0) stderrChunks.push(chunk.subarray(0, remaining));
            stderrBytes = this.maxBufferBytes;
            stderrTruncated = true;
          } else {
            stderrChunks.push(chunk);
            stderrBytes += chunk.length;
          }
        }
        if (this.onLogLine) {
          lineBuf += chunk.toString('utf8');
          let idx: number;
          while ((idx = lineBuf.indexOf('\n')) !== -1) {
            const line = lineBuf.slice(0, idx);
            lineBuf = lineBuf.slice(idx + 1);
            const scrubbed = scrubLogs(line).text;
            this.onLogLine({ stream: target, line: scrubbed });
          }
        }
      });
      stream.on('end', () => {
        if (this.onLogLine && lineBuf.length > 0) {
          const scrubbed = scrubLogs(lineBuf).text;
          this.onLogLine({ stream: target, line: scrubbed });
          lineBuf = '';
        }
      });
    };

    if (child.stdout) drainStream(child.stdout, 'stdout');
    if (child.stderr) drainStream(child.stderr, 'stderr');

    const exit = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
      error: Error | null;
    }>((res) => {
      child.once('error', (error) => {
        res({ code: null, signal: null, error });
      });
      child.once('close', (code, signal) => {
        res({ code, signal, error: null });
      });
    });
    clearTimeout(killTimer);

    let stdout = Buffer.concat(stdoutChunks).toString('utf8');
    let stderr = Buffer.concat(stderrChunks).toString('utf8');
    if (stdoutTruncated) stdout += `\n[scrubbed:truncated:stdout exceeded ${this.maxBufferBytes}B]`;
    if (stderrTruncated) stderr += `\n[scrubbed:truncated:stderr exceeded ${this.maxBufferBytes}B]`;

    const exitReason = classifyExit({
      code: exit.code,
      signal: exit.signal,
      error: exit.error,
      timedOut,
    });

    return {
      exitReason,
      executionStatus: mapExitReason(exitReason),
      stdout,
      stderr,
      durationMs: Date.now() - args.startTimestamp,
    };
  }
}

function classifyExit(args: {
  code: number | null;
  signal: NodeJS.Signals | null;
  error: Error | null;
  timedOut: boolean;
}): SandboxExitReason {
  if (args.timedOut) return { kind: 'timeout' };
  if (args.error) {
    // AbortError fires when the controller fires before the process resolved
    // naturally. The timedOut path catches that case; anything else is a real
    // sandbox-level failure.
    if ((args.error as NodeJS.ErrnoException).code === 'ABORT_ERR') {
      return { kind: 'timeout' };
    }
    return { kind: 'sandbox_error', message: args.error.message };
  }
  if (args.signal) {
    return { kind: 'killed_signal', signal: args.signal };
  }
  if (args.code === 0) return { kind: 'success' };
  if (args.code === null) return { kind: 'sandbox_error', message: 'no exit code' };
  return { kind: 'nonzero_exit', code: args.code };
}

/**
 * Walk `srcDir` and copy every regular file into `dstDir`, refusing entries
 * that would escape the destination. Symlinks are rejected outright — the
 * dev adapter mirrors Docker's `--no-new-privileges`-ish posture by never
 * dereferencing arbitrary FS handles.
 */
async function copyBundleSafely(srcDir: string, dstDir: string): Promise<void> {
  const srcStat = await fs.lstat(srcDir).catch(() => null);
  if (!srcStat) {
    // Caller passed a hostWorkspaceBundle that doesn't exist; treat as empty.
    // This keeps unit tests trivial — real production wires a real bundle.
    return;
  }
  if (srcStat.isSymbolicLink()) {
    throw new LocalFsSandboxPathError(srcDir, 'bundle root is a symlink');
  }
  if (srcStat.isFile()) {
    const dst = join(dstDir, 'bundle');
    await fs.copyFile(srcDir, dst);
    return;
  }
  if (!srcStat.isDirectory()) return;

  const queue: string[] = [''];
  while (queue.length > 0) {
    const rel = queue.shift() as string;
    const absSrc = rel === '' ? srcDir : join(srcDir, rel);
    const entries = await fs.readdir(absSrc, { withFileTypes: true });
    for (const entry of entries) {
      const entryRel = rel === '' ? entry.name : join(rel, entry.name);
      assertSafeRelativePath(entryRel);
      const absEntrySrc = join(srcDir, entryRel);
      const absEntryDst = join(dstDir, entryRel);
      if (!isPathInside(absEntryDst, dstDir)) {
        throw new LocalFsSandboxPathError(entryRel, 'resolves outside tempdir');
      }
      if (entry.isSymbolicLink()) {
        throw new LocalFsSandboxPathError(entryRel, 'symlinks are not permitted');
      }
      if (entry.isDirectory()) {
        await fs.mkdir(absEntryDst, { recursive: true, mode: 0o700 });
        queue.push(entryRel);
      } else if (entry.isFile()) {
        await fs.mkdir(dirname(absEntryDst), { recursive: true, mode: 0o700 });
        await fs.copyFile(absEntrySrc, absEntryDst);
      } else {
        throw new LocalFsSandboxPathError(entryRel, 'unsupported file type');
      }
    }
  }
}

/**
 * Reject any relative path that escapes the workspace. Mirrors what we plan
 * to apply to caller-provided `workspaceFiles` lists once the bundle protocol
 * is unified between `LocalFsSandbox` and `DockerSandbox`.
 */
export function assertSafeRelativePath(rel: string): void {
  if (rel === '') {
    throw new LocalFsSandboxPathError(rel, 'empty path');
  }
  if (isAbsolute(rel)) {
    throw new LocalFsSandboxPathError(rel, 'absolute paths are not permitted');
  }
  if (rel.includes('\0')) {
    throw new LocalFsSandboxPathError(rel, 'NUL byte');
  }
  if (rel.includes('\\') && sep !== '\\') {
    throw new LocalFsSandboxPathError(rel, 'non-portable separator');
  }
  // Reject `..` BEFORE normalization so paths like `foo/../bar` (which would
  // normalize to `bar` and silently drop the traversal) are still caught.
  const rawSegments = rel.split(/[\\/]/);
  for (const segment of rawSegments) {
    if (segment === '..') {
      throw new LocalFsSandboxPathError(rel, 'path traversal segment');
    }
  }
  const normalized = normalize(rel);
  if (normalized.startsWith('..')) {
    throw new LocalFsSandboxPathError(rel, 'path traversal segment');
  }
}

/**
 * Convenience helper for callers that want artifact metadata. Reads a list of
 * declared output files relative to a tempdir, returning sha256 + size for
 * each. Missing files are skipped — callers are expected to express required
 * outputs through their own contract.
 */
export async function readDeclaredOutputs(
  rootDir: string,
  outputPaths: ReadonlyArray<string>,
): Promise<Array<{ path: string; sha256: string; sizeBytes: number }>> {
  const out: Array<{ path: string; sha256: string; sizeBytes: number }> = [];
  for (const rel of outputPaths) {
    assertSafeRelativePath(rel);
    const abs = resolve(rootDir, rel);
    if (!isPathInside(abs, rootDir)) continue;
    const stat = await fs.lstat(abs).catch(() => null);
    if (!stat || !stat.isFile()) continue;
    const buf = await fs.readFile(abs);
    out.push({
      path: rel,
      sha256: createHash('sha256').update(buf).digest('hex'),
      sizeBytes: stat.size,
    });
  }
  return out;
}

