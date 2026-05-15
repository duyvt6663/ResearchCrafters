import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Logging surfaces for the runner.
 *
 * INVARIANT — application logs MUST be stored separately from captured
 * submission output (backlog/03-cli-runner.md, Security: "Store runner logs
 * separately from application logs").
 *
 * Two surfaces, two sinks:
 *
 * 1. {@link AppLogger} — operational telemetry from the worker process
 *    itself (worker start/stop, job dispatch, errors). Writes structured
 *    JSON to the configured stream (default `process.stderr`) and tags
 *    every record with `category: 'app.runner'`. Untrusted submission
 *    output MUST NEVER flow through this logger.
 *
 * 2. {@link RunnerOutputSink} — captured stdout/stderr from a learner's
 *    submission (post-scrub). The default {@link FilesystemRunnerOutputSink}
 *    writes a per-job file pair under `RUNNER_LOG_DIR` (or
 *    `${os.tmpdir()}/runner-jobs`). This sink MUST NEVER share a stream
 *    with the app logger; mixing the two would let an attacker pollute the
 *    operational log stream from inside the sandbox.
 *
 * Tests inject {@link NoopRunnerOutputSink} and pass a buffer-backed stream
 * to {@link createAppLogger} so neither sink touches the host process.
 */

export type AppLogLevel = 'info' | 'warn' | 'error';

export interface AppLogRecord {
  ts: string;
  level: AppLogLevel;
  category: 'app.runner';
  msg: string;
  [k: string]: unknown;
}

export interface AppLogger {
  log(level: AppLogLevel, msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface CreateAppLoggerOptions {
  /** Destination stream. Defaults to `process.stderr`. */
  stream?: NodeJS.WritableStream;
  /** Clock injection for tests. */
  now?: () => Date;
}

export function createAppLogger(opts: CreateAppLoggerOptions = {}): AppLogger {
  const stream = opts.stream ?? process.stderr;
  const now = opts.now ?? ((): Date => new Date());
  const emit = (level: AppLogLevel, msg: string, fields?: Record<string, unknown>): void => {
    const record: AppLogRecord = {
      ts: now().toISOString(),
      level,
      category: 'app.runner',
      msg,
      ...(fields ?? {}),
    };
    stream.write(`${JSON.stringify(record)}\n`);
  };
  return {
    log: emit,
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}

/** Process-wide default app logger. Writes to `process.stderr`. */
export const appLogger: AppLogger = createAppLogger();

export type SubmissionStream = 'stdout' | 'stderr';

export interface RunnerOutputEntry {
  jobId: string;
  stream: SubmissionStream;
  text: string;
}

export interface RunnerOutputSink {
  write(entry: RunnerOutputEntry): Promise<void>;
}

export class RunnerOutputSinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunnerOutputSinkError';
  }
}

/** Restrictive jobId charset; mirrors filename-safety we apply elsewhere. */
const SAFE_JOB_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

export interface FilesystemRunnerOutputSinkOptions {
  /** Override the directory root. Defaults to `RUNNER_LOG_DIR` or `${tmpdir}/runner-jobs`. */
  baseDir?: string;
}

export class FilesystemRunnerOutputSink implements RunnerOutputSink {
  private readonly baseDir: string;

  constructor(opts: FilesystemRunnerOutputSinkOptions = {}) {
    this.baseDir =
      opts.baseDir ?? process.env['RUNNER_LOG_DIR'] ?? join(tmpdir(), 'runner-jobs');
  }

  async write(entry: RunnerOutputEntry): Promise<void> {
    if (!SAFE_JOB_ID.test(entry.jobId)) {
      throw new RunnerOutputSinkError(
        `RunnerOutputSink: refusing unsafe jobId "${entry.jobId}"`,
      );
    }
    if (entry.stream !== 'stdout' && entry.stream !== 'stderr') {
      throw new RunnerOutputSinkError(
        `RunnerOutputSink: unknown stream "${entry.stream as string}"`,
      );
    }
    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    const file = join(this.baseDir, `${entry.jobId}.${entry.stream}.log`);
    await fs.appendFile(file, entry.text, { mode: 0o600 });
  }
}

/** Test/default no-op sink: drops captured output instead of writing it anywhere. */
export class NoopRunnerOutputSink implements RunnerOutputSink {
  async write(_entry: RunnerOutputEntry): Promise<void> {
    return;
  }
}

/**
 * Persist a finished job's captured stdout/stderr through the sink. Helper
 * used by the worker so the separation invariant is honoured at exactly one
 * call site.
 */
export async function persistSubmissionOutput(
  sink: RunnerOutputSink,
  jobId: string,
  artifacts: { stdout: string; stderr: string },
): Promise<void> {
  if (artifacts.stdout) {
    await sink.write({ jobId, stream: 'stdout', text: artifacts.stdout });
  }
  if (artifacts.stderr) {
    await sink.write({ jobId, stream: 'stderr', text: artifacts.stderr });
  }
}
