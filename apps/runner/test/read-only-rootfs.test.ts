import { describe, expect, it } from 'vitest';
import { FakeSandbox, sanitizeRunOpts, type SandboxRunOpts } from '../src/sandbox.js';
import { runTestMode } from '../src/modes/test.js';
import { runReplayMode, type FixtureReader } from '../src/modes/replay.js';
import { runMiniExperimentMode } from '../src/modes/mini-experiment.js';
import type { RunJob } from '../src/types.js';

class StaticFixtureReader implements FixtureReader {
  constructor(private readonly digests: Record<string, string>) {}
  async hashFile(path: string): Promise<string> {
    const digest = this.digests[path];
    if (digest === undefined) throw new Error(`unexpected fixture ${path}`);
    return digest;
  }
}

function captureOpts(): {
  sandbox: FakeSandbox;
  seen: SandboxRunOpts[];
} {
  const seen: SandboxRunOpts[] = [];
  const sandbox = new FakeSandbox(async (opts) => {
    seen.push(opts);
    return {
      exitReason: { kind: 'success' },
      executionStatus: 'ok',
      stdout: '',
      stderr: '',
      durationMs: 1,
    };
  });
  return { sandbox, seen };
}

const baseResources = { cpu: 1, memory_mb: 256, wall_clock_seconds: 5 };

function makeTestJob(): RunJob {
  return {
    jobId: 'j-test',
    submissionId: 'sub-test',
    stageId: 'S-test',
    packageVersionId: 'pv1',
    mode: 'test',
    bundleUri: '',
    workspacePath: '/workspace',
    runnerStage: { mode: 'test', command: '/bin/true' },
    resources: baseResources,
    userId: 'u1',
  };
}

function makeReplayJob(): RunJob {
  return {
    jobId: 'j-replay',
    submissionId: 'sub-replay',
    stageId: 'S-replay',
    packageVersionId: 'pv1',
    mode: 'replay',
    bundleUri: '',
    workspacePath: '/workspace',
    runnerStage: { mode: 'replay', command: '/bin/true', fixtures: [] },
    resources: baseResources,
    userId: 'u1',
  };
}

function makeMiniJob(): RunJob {
  return {
    jobId: 'j-mini',
    submissionId: 'sub-mini',
    stageId: 'S-mini',
    packageVersionId: 'pv1',
    mode: 'mini_experiment',
    bundleUri: '',
    workspacePath: '/workspace',
    runnerStage: { mode: 'mini_experiment', command: '/bin/true' },
    resources: baseResources,
    userId: 'u1',
  };
}

describe('read-only rootfs policy', () => {
  it('sanitizeRunOpts defaults readOnlyRootfs to true', () => {
    const opts = sanitizeRunOpts({
      image: 'img',
      command: ['/bin/true'],
      workspacePath: '/workspace',
      hostWorkspaceBundle: '',
      limits: { cpu: 1, memoryMb: 64, wallClockSeconds: 5, maxUploadBytes: 1024 },
      network: 'none',
    });
    expect(opts.readOnlyRootfs).toBe(true);
  });

  it('preserves an explicit readOnlyRootfs=true', () => {
    const opts = sanitizeRunOpts({
      image: 'img',
      command: ['/bin/true'],
      workspacePath: '/workspace',
      hostWorkspaceBundle: '',
      limits: { cpu: 1, memoryMb: 64, wallClockSeconds: 5, maxUploadBytes: 1024 },
      network: 'none',
      readOnlyRootfs: true,
    });
    expect(opts.readOnlyRootfs).toBe(true);
  });

  it('does NOT silently flip readOnlyRootfs=false to true', () => {
    // Defence-in-depth: callers that explicitly opt out must reach the
    // sandbox so the sandbox can refuse them. sanitizeRunOpts only fills the
    // default; it must not mask a deliberate downgrade.
    const opts = sanitizeRunOpts({
      image: 'img',
      command: ['/bin/true'],
      workspacePath: '/workspace',
      hostWorkspaceBundle: '',
      limits: { cpu: 1, memoryMb: 64, wallClockSeconds: 5, maxUploadBytes: 1024 },
      network: 'none',
      readOnlyRootfs: false,
    });
    expect(opts.readOnlyRootfs).toBe(false);
  });

  it('test mode hands readOnlyRootfs=true to the sandbox', async () => {
    const { sandbox, seen } = captureOpts();
    await runTestMode(makeTestJob(), { sandbox, image: 'test:placeholder' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.readOnlyRootfs).toBe(true);
    expect(seen[0]?.network).toBe('none');
  });

  it('replay mode hands readOnlyRootfs=true to the sandbox', async () => {
    const { sandbox, seen } = captureOpts();
    await runReplayMode(makeReplayJob(), {
      sandbox,
      image: 'replay:placeholder',
      fixtureReader: new StaticFixtureReader({}),
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.readOnlyRootfs).toBe(true);
    expect(seen[0]?.network).toBe('none');
  });

  it('mini_experiment mode hands readOnlyRootfs=true to the sandbox', async () => {
    const { sandbox, seen } = captureOpts();
    await runMiniExperimentMode(makeMiniJob(), { sandbox, image: 'mini:placeholder' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.readOnlyRootfs).toBe(true);
    expect(seen[0]?.network).toBe('none');
  });
});

