import { describe, expect, it } from 'vitest';
import {
  enforceMaxUploadSize,
  evaluateNetworkPolicy,
  InMemoryRateLimiter,
  isPathInside,
  MAX_UPLOAD_BYTES,
  stripSecretsFromEnv,
  UploadTooLargeError,
} from '../src/security.js';
import { scrubLogs } from '../src/log-scrub.js';
import { mapExitReason } from '../src/execution-status.js';
import { DockerSandbox, FakeSandbox, sanitizeRunOpts } from '../src/sandbox.js';

describe('stripSecretsFromEnv', () => {
  it('drops well-known secret env vars', () => {
    const result = stripSecretsFromEnv({
      AWS_ACCESS_KEY_ID: 'AKIA...',
      AWS_SECRET_ACCESS_KEY: 'sekrit',
      ANTHROPIC_API_KEY: 'sk-...',
      DATABASE_URL: 'postgres://...',
      PATH: '/usr/bin',
      HOME: '/home/sandbox',
    });
    expect(result.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(result.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(result.ANTHROPIC_API_KEY).toBeUndefined();
    expect(result.DATABASE_URL).toBeUndefined();
    expect(result.PATH).toBe('/usr/bin');
    expect(result.HOME).toBe('/home/sandbox');
  });

  it('only forwards allowlisted keys', () => {
    const result = stripSecretsFromEnv({
      RANDOM_VAR: 'leak-me',
      PATH: '/usr/bin',
    });
    expect(result.RANDOM_VAR).toBeUndefined();
    expect(result.PATH).toBe('/usr/bin');
  });

  it('skips undefined values', () => {
    const result = stripSecretsFromEnv({ PATH: undefined });
    expect(result.PATH).toBeUndefined();
  });
});

describe('scrubLogs', () => {
  it('replaces AWS access key', () => {
    const r = scrubLogs('found AKIA1234567890ABCDEF in logs');
    expect(r.text).not.toContain('AKIA1234567890ABCDEF');
    expect(r.triggered).toContain('aws_access_key_id');
  });

  it('replaces github PATs', () => {
    const r = scrubLogs('token=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(r.text).not.toContain('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(r.triggered).toContain('github_pat');
  });

  it('replaces openai-style sk- keys', () => {
    const r = scrubLogs('using key sk-abcDEFghiJKLmnoPQRstu123456');
    expect(r.text).not.toContain('sk-abcDEFghiJKLmnoPQRstu123456');
    expect(r.triggered).toContain('openai_or_similar_sk');
  });

  it('replaces bearer tokens', () => {
    const r = scrubLogs('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123');
    expect(r.text).not.toContain('abcdefghijklmnopqrstuvwxyz123');
    expect(r.triggered).toContain('bearer_token');
  });

  it('replaces SECRET= assignments', () => {
    const r = scrubLogs('export API_KEY=supersecret123456');
    expect(r.text).not.toContain('supersecret123456');
    expect(r.triggered).toContain('env_secret_assignment');
  });

  it('replaces private key blocks', () => {
    const r = scrubLogs(
      '-----BEGIN RSA PRIVATE KEY-----\nMIIB...\n-----END RSA PRIVATE KEY-----',
    );
    expect(r.text).not.toContain('MIIB');
    expect(r.triggered).toContain('private_key_block');
  });

  it('returns empty triggered list for clean input', () => {
    const r = scrubLogs('all good here');
    expect(r.triggered).toEqual([]);
  });
});

describe('enforceMaxUploadSize', () => {
  it('throws when over the limit', () => {
    expect(() => enforceMaxUploadSize(MAX_UPLOAD_BYTES + 1)).toThrow(UploadTooLargeError);
  });
  it('passes when under', () => {
    expect(() => enforceMaxUploadSize(1024)).not.toThrow();
  });
});

describe('evaluateNetworkPolicy', () => {
  it('denies network when policy is none', () => {
    expect(evaluateNetworkPolicy('none').allowed).toBe(false);
  });
  it('allows restricted with reason', () => {
    expect(evaluateNetworkPolicy('restricted').allowed).toBe(true);
  });
});

describe('InMemoryRateLimiter', () => {
  it('blocks once limit is exceeded per (user,package)', async () => {
    const rl = new InMemoryRateLimiter(2);
    expect((await rl.check({ userId: 'u', packageId: 'p' })).allowed).toBe(true);
    expect((await rl.check({ userId: 'u', packageId: 'p' })).allowed).toBe(true);
    expect((await rl.check({ userId: 'u', packageId: 'p' })).allowed).toBe(false);
  });
});

describe('mapExitReason', () => {
  it('maps every exit reason to an ExecutionStatus', () => {
    expect(mapExitReason({ kind: 'success' })).toBe('ok');
    expect(mapExitReason({ kind: 'timeout' })).toBe('timeout');
    expect(mapExitReason({ kind: 'oom' })).toBe('oom');
    expect(mapExitReason({ kind: 'nonzero_exit', code: 1 })).toBe('exit_nonzero');
    expect(mapExitReason({ kind: 'killed_signal', signal: 'SIGKILL' })).toBe('crash');
    expect(mapExitReason({ kind: 'sandbox_error', message: 'boom' })).toBe('crash');
  });
});

describe('DockerSandbox', () => {
  it('throws unless RUNNER_DOCKER_ENABLED is true', () => {
    const prev = process.env['RUNNER_DOCKER_ENABLED'];
    delete process.env['RUNNER_DOCKER_ENABLED'];
    try {
      expect(() => new DockerSandbox()).toThrow(/RUNNER_DOCKER_ENABLED/);
    } finally {
      if (prev !== undefined) process.env['RUNNER_DOCKER_ENABLED'] = prev;
    }
  });
});

describe('sanitizeRunOpts', () => {
  it('strips secrets from env and forces readOnlyRootfs default', () => {
    const opts = sanitizeRunOpts({
      image: 'x',
      command: ['echo', 'hi'],
      workspacePath: '/workspace',
      hostWorkspaceBundle: '/tmp/bundle',
      limits: { cpu: 1, memoryMb: 512, wallClockSeconds: 5, maxUploadBytes: 1000 },
      env: { AWS_ACCESS_KEY_ID: 'AKIA', PATH: '/usr/bin' },
      network: 'none',
    });
    expect(opts.env).toEqual({ PATH: '/usr/bin' });
    expect(opts.readOnlyRootfs).toBe(true);
  });
});

describe('isPathInside', () => {
  it('returns true when child is nested inside parent', () => {
    expect(isPathInside('/tmp/sandbox/run-1/file.txt', '/tmp/sandbox/run-1')).toBe(true);
    expect(isPathInside('/tmp/sandbox/run-1/sub/dir/x', '/tmp/sandbox/run-1')).toBe(true);
  });
  it('returns true when child equals parent', () => {
    expect(isPathInside('/tmp/sandbox/run-1', '/tmp/sandbox/run-1')).toBe(true);
  });
  it('returns false when child escapes via ..', () => {
    expect(isPathInside('/tmp/sandbox/run-1/../other', '/tmp/sandbox/run-1')).toBe(false);
  });
  it('returns false for sibling directories', () => {
    expect(isPathInside('/tmp/sandbox/run-2/file', '/tmp/sandbox/run-1')).toBe(false);
  });
  it('returns false for prefix-but-not-inside paths', () => {
    expect(isPathInside('/tmp/sandbox/run-12/file', '/tmp/sandbox/run-1')).toBe(false);
  });
});

describe('FakeSandbox', () => {
  it('returns whatever the handler returns', async () => {
    const sb = new FakeSandbox(() => ({
      exitReason: { kind: 'success' },
      executionStatus: 'ok',
      stdout: 's',
      stderr: '',
      durationMs: 1,
    }));
    const r = await sb.run({
      image: 'x',
      command: ['echo'],
      workspacePath: '/workspace',
      hostWorkspaceBundle: '/tmp/bundle',
      limits: { cpu: 1, memoryMb: 1, wallClockSeconds: 1, maxUploadBytes: 1 },
      network: 'none',
    });
    expect(r.executionStatus).toBe('ok');
  });
});
