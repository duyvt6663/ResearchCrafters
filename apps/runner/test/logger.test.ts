import { promises as fs } from 'node:fs';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createAppLogger,
  FilesystemRunnerOutputSink,
  NoopRunnerOutputSink,
  persistSubmissionOutput,
  RunnerOutputSinkError,
} from '../src/logger.js';
import { handleJob } from '../src/worker.js';
import { FakeSandbox } from '../src/sandbox.js';
import type { RunJob } from '../src/types.js';

function makeBufferStream(): { stream: Writable; chunks: string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb): void {
      chunks.push(chunk.toString('utf8'));
      cb();
    },
  });
  return { stream, chunks };
}

describe('createAppLogger', () => {
  it('writes structured JSON tagged as app.runner to the configured stream', () => {
    const { stream, chunks } = makeBufferStream();
    const logger = createAppLogger({
      stream,
      now: () => new Date('2026-05-15T00:00:00.000Z'),
    });
    logger.info('worker.start', { queueName: 'submission_run' });
    logger.warn('job.output_sink_failed', { jobId: 'job-1' });
    logger.error('job.failed', { jobId: 'job-2', error: 'boom' });

    expect(chunks).toHaveLength(3);
    const parsed = chunks.map((line) => JSON.parse(line.trim()));
    for (const record of parsed) {
      expect(record.category).toBe('app.runner');
      expect(record.ts).toBe('2026-05-15T00:00:00.000Z');
    }
    expect(parsed[0]).toMatchObject({ level: 'info', msg: 'worker.start', queueName: 'submission_run' });
    expect(parsed[1]).toMatchObject({ level: 'warn', msg: 'job.output_sink_failed', jobId: 'job-1' });
    expect(parsed[2]).toMatchObject({ level: 'error', msg: 'job.failed', jobId: 'job-2', error: 'boom' });
  });
});

describe('FilesystemRunnerOutputSink', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'runner-output-sink-'));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('writes stdout and stderr to separate per-job files', async () => {
    const sink = new FilesystemRunnerOutputSink({ baseDir });
    await sink.write({ jobId: 'job-a', stream: 'stdout', text: 'hello\n' });
    await sink.write({ jobId: 'job-a', stream: 'stderr', text: 'oops\n' });
    await sink.write({ jobId: 'job-a', stream: 'stdout', text: 'world\n' });

    expect(readFileSync(join(baseDir, 'job-a.stdout.log'), 'utf8')).toBe('hello\nworld\n');
    expect(readFileSync(join(baseDir, 'job-a.stderr.log'), 'utf8')).toBe('oops\n');
  });

  it('rejects unsafe jobIds that would escape the directory', async () => {
    const sink = new FilesystemRunnerOutputSink({ baseDir });
    await expect(
      sink.write({ jobId: '../escape', stream: 'stdout', text: 'x' }),
    ).rejects.toBeInstanceOf(RunnerOutputSinkError);
    await expect(
      sink.write({ jobId: 'with space', stream: 'stdout', text: 'x' }),
    ).rejects.toBeInstanceOf(RunnerOutputSinkError);
  });
});

describe('persistSubmissionOutput', () => {
  it('skips empty streams instead of writing zero-byte files', async () => {
    const calls: Array<{ stream: string; text: string }> = [];
    const sink = {
      async write(entry: { jobId: string; stream: 'stdout' | 'stderr'; text: string }): Promise<void> {
        calls.push({ stream: entry.stream, text: entry.text });
      },
    };
    await persistSubmissionOutput(sink, 'job-1', { stdout: 'hi', stderr: '' });
    expect(calls).toEqual([{ stream: 'stdout', text: 'hi' }]);
  });
});

describe('handleJob log separation', () => {
  it('routes submission output to the sink and operational events to the app logger', async () => {
    const { stream: appStream, chunks: appChunks } = makeBufferStream();
    const sinkCalls: Array<{ stream: string; text: string }> = [];
    const sink = {
      async write(entry: { jobId: string; stream: 'stdout' | 'stderr'; text: string }): Promise<void> {
        sinkCalls.push({ stream: entry.stream, text: entry.text });
      },
    };
    const submissionStdout = 'LEARNER_OUTPUT_LINE\n';
    const submissionStderr = 'LEARNER_ERROR_LINE\n';
    const sandbox = new FakeSandbox(async () => ({
      exitReason: { kind: 'success' as const },
      executionStatus: 'ok' as const,
      stdout: submissionStdout,
      stderr: submissionStderr,
      durationMs: 1,
    }));
    const job: RunJob = {
      jobId: 'job-sep-1',
      submissionId: 'sub-1',
      stageId: 'stage-1',
      packageVersionId: 'pkg-v1',
      mode: 'test',
      bundleUri: '',
      workspacePath: '/workspace',
      userId: 'user-1',
      runnerStage: { mode: 'test', command: '/bin/true' },
      resources: { cpu: 1, memory_mb: 256, wall_clock_seconds: 5 },
    };

    const appLogger = createAppLogger({
      stream: appStream,
      now: () => new Date('2026-05-15T00:00:00.000Z'),
    });
    const result = await handleJob(job, {
      sandbox,
      images: { test: 'test:img', replay: 'replay:img', miniExperiment: 'mini:img' },
      fixtureReader: { hashFile: async () => '0' } as never,
      appLogger,
      outputSink: sink,
    });

    expect(result.artifacts.stdout).toBe(submissionStdout);
    expect(sinkCalls).toEqual([
      { stream: 'stdout', text: submissionStdout },
      { stream: 'stderr', text: submissionStderr },
    ]);

    const joinedApp = appChunks.join('');
    expect(joinedApp).not.toContain('LEARNER_OUTPUT_LINE');
    expect(joinedApp).not.toContain('LEARNER_ERROR_LINE');
    const events = appChunks.map((c) => JSON.parse(c.trim()));
    expect(events.map((e) => e.msg)).toEqual(['job.start', 'job.complete']);
    for (const e of events) {
      expect(e.category).toBe('app.runner');
      expect(e.jobId).toBe('job-sep-1');
    }
  });

  it('NoopRunnerOutputSink drops submission output silently', async () => {
    const sink = new NoopRunnerOutputSink();
    await expect(
      sink.write({ jobId: 'job-x', stream: 'stdout', text: 'anything' }),
    ).resolves.toBeUndefined();
  });
});
