import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  FixtureMismatchError,
  FixtureMissingError,
  verifyFixtures,
  type FixtureReader,
} from '../src/modes/replay.js';
import { runReplayMode } from '../src/modes/replay.js';
import { FakeSandbox } from '../src/sandbox.js';
import type { RunJob } from '../src/types.js';

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

class InMemoryFixtureReader implements FixtureReader {
  constructor(private readonly files: Record<string, string>) {}
  async hashFile(path: string): Promise<string> {
    const content = this.files[path];
    if (content === undefined) throw new FixtureMissingError(path);
    return sha256(content);
  }
}

function makeJob(overrides: Partial<RunJob> = {}): RunJob {
  return {
    jobId: 'j1',
    submissionId: 'sub1',
    stageId: 'S003',
    packageVersionId: 'pv1',
    mode: 'replay',
    bundleUri: 'mem:///bundle',
    workspacePath: '/workspace',
    runnerStage: {
      mode: 'replay',
      command: 'python check.py',
      fixtures: [
        { path: 'fixtures/case_a.json', sha256: sha256('hello') },
        { path: 'fixtures/case_b.json', sha256: sha256('world') },
      ],
    },
    resources: { cpu: 2, memory_mb: 1024, wall_clock_seconds: 30 },
    userId: 'u1',
    ...overrides,
  };
}

describe('verifyFixtures', () => {
  it('passes when every hash matches', async () => {
    const reader = new InMemoryFixtureReader({
      'fixtures/case_a.json': 'hello',
      'fixtures/case_b.json': 'world',
    });
    await expect(
      verifyFixtures(
        [
          { path: 'fixtures/case_a.json', sha256: sha256('hello') },
          { path: 'fixtures/case_b.json', sha256: sha256('world') },
        ],
        reader,
      ),
    ).resolves.toBeUndefined();
  });

  it('throws FixtureMismatchError on hash mismatch', async () => {
    const reader = new InMemoryFixtureReader({
      'fixtures/case_a.json': 'TAMPERED',
    });
    await expect(
      verifyFixtures(
        [{ path: 'fixtures/case_a.json', sha256: sha256('hello') }],
        reader,
      ),
    ).rejects.toBeInstanceOf(FixtureMismatchError);
  });

  it('throws FixtureMissingError when fixture file is missing', async () => {
    const reader = new InMemoryFixtureReader({});
    await expect(
      verifyFixtures(
        [{ path: 'fixtures/case_a.json', sha256: sha256('hello') }],
        reader,
      ),
    ).rejects.toBeInstanceOf(FixtureMissingError);
  });
});

describe('runReplayMode', () => {
  it('refuses execution when fixture hash mismatches', async () => {
    const sandbox = new FakeSandbox(async () => {
      throw new Error('sandbox should NOT be invoked when fixtures fail');
    });
    const reader = new InMemoryFixtureReader({
      'fixtures/case_a.json': 'TAMPERED',
      'fixtures/case_b.json': 'world',
    });
    await expect(
      runReplayMode(makeJob(), {
        sandbox,
        image: 'replay:placeholder',
        fixtureReader: reader,
      }),
    ).rejects.toBeInstanceOf(FixtureMismatchError);
  });

  it('runs the sandbox after fixtures verify', async () => {
    let invoked = false;
    const sandbox = new FakeSandbox(async () => {
      invoked = true;
      return {
        exitReason: { kind: 'success' },
        executionStatus: 'ok',
        stdout: 'ok',
        stderr: '',
        durationMs: 10,
      };
    });
    const reader = new InMemoryFixtureReader({
      'fixtures/case_a.json': 'hello',
      'fixtures/case_b.json': 'world',
    });
    const result = await runReplayMode(makeJob(), {
      sandbox,
      image: 'replay:placeholder',
      fixtureReader: reader,
    });
    expect(invoked).toBe(true);
    expect(result.executionStatus).toBe('ok');
  });
});
