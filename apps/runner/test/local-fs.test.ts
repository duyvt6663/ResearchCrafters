import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertSafeRelativePath,
  LocalFsSandbox,
  LocalFsSandboxConfigError,
  LocalFsSandboxPathError,
  MAX_LOCAL_FS_MEMORY_MB,
} from '../src/sandboxes/local-fs.js';
import type { SandboxRunOpts } from '../src/sandbox.js';

const platformIsWin = process.platform === 'win32';

function makeOpts(overrides: Partial<SandboxRunOpts> = {}): SandboxRunOpts {
  return {
    image: 'unused-for-local-fs',
    command: ['/bin/sh', '-c', 'echo hello'],
    workspacePath: '/workspace',
    hostWorkspaceBundle: '',
    limits: {
      cpu: 1,
      memoryMb: 256,
      wallClockSeconds: 5,
      maxUploadBytes: 1024 * 1024,
    },
    network: 'none',
    ...overrides,
  };
}

describe('LocalFsSandbox', () => {
  let baseDir: string;
  beforeEach(async () => {
    baseDir = await fs.mkdtemp(join(tmpdir(), 'rc-localfs-test-'));
  });
  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it.skipIf(platformIsWin)('runs a happy-path command and reports ok', async () => {
    const sandbox = new LocalFsSandbox({ baseDir });
    const result = await sandbox.run(makeOpts({ command: ['/bin/sh', '-c', 'echo hello'] }));
    expect(result.executionStatus).toBe('ok');
    expect(result.stdout).toContain('hello');
    expect(result.exitReason.kind).toBe('success');
    // Tempdir cleaned up.
    const remaining = await fs.readdir(baseDir).catch(() => []);
    expect(remaining).toEqual([]);
  });

  it.skipIf(platformIsWin)('captures non-zero exit code', async () => {
    const sandbox = new LocalFsSandbox({ baseDir });
    const result = await sandbox.run(makeOpts({ command: ['/bin/sh', '-c', 'exit 7'] }));
    expect(result.executionStatus).toBe('exit_nonzero');
    if (result.exitReason.kind === 'nonzero_exit') {
      expect(result.exitReason.code).toBe(7);
    } else {
      throw new Error(`expected nonzero_exit, got ${result.exitReason.kind}`);
    }
  });

  it.skipIf(platformIsWin)('returns timeout when wallClock elapses', async () => {
    const sandbox = new LocalFsSandbox({ baseDir });
    const start = Date.now();
    const result = await sandbox.run(
      makeOpts({
        command: ['/bin/sh', '-c', 'sleep 5'],
        limits: { cpu: 1, memoryMb: 64, wallClockSeconds: 1, maxUploadBytes: 1024 },
      }),
    );
    expect(result.executionStatus).toBe('timeout');
    expect(Date.now() - start).toBeLessThan(4000);
  });

  it('refuses non-none network policy', async () => {
    const sandbox = new LocalFsSandbox({ baseDir });
    await expect(
      sandbox.run(makeOpts({ network: 'restricted' })),
    ).rejects.toBeInstanceOf(LocalFsSandboxConfigError);
  });

  it('refuses memoryMb above the documented cap', async () => {
    const sandbox = new LocalFsSandbox({ baseDir });
    await expect(
      sandbox.run(
        makeOpts({
          limits: {
            cpu: 1,
            memoryMb: MAX_LOCAL_FS_MEMORY_MB + 1,
            wallClockSeconds: 5,
            maxUploadBytes: 1024,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(LocalFsSandboxConfigError);
  });

  it.skipIf(platformIsWin)('rejects symlinks in the bundle', async () => {
    const bundle = await fs.mkdtemp(join(tmpdir(), 'rc-bundle-'));
    try {
      await fs.writeFile(join(bundle, 'real.txt'), 'ok');
      await fs.symlink(join(bundle, 'real.txt'), join(bundle, 'link.txt'));
      const sandbox = new LocalFsSandbox({ baseDir });
      await expect(
        sandbox.run(makeOpts({ hostWorkspaceBundle: bundle })),
      ).rejects.toBeInstanceOf(LocalFsSandboxPathError);
    } finally {
      await fs.rm(bundle, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it.skipIf(platformIsWin)('copies a directory bundle and runs a script from it', async () => {
    const bundle = await fs.mkdtemp(join(tmpdir(), 'rc-bundle-'));
    try {
      await fs.writeFile(join(bundle, 'hello.txt'), 'world');
      const sandbox = new LocalFsSandbox({ baseDir });
      const result = await sandbox.run(
        makeOpts({
          hostWorkspaceBundle: bundle,
          command: ['/bin/sh', '-c', 'cat hello.txt'],
        }),
      );
      expect(result.executionStatus).toBe('ok');
      expect(result.stdout).toContain('world');
    } finally {
      await fs.rm(bundle, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('cleans up tempdir on error', async () => {
    const sandbox = new LocalFsSandbox({ baseDir });
    await sandbox
      .run(makeOpts({ network: 'restricted' }))
      .catch(() => undefined);
    const remaining = await fs.readdir(baseDir).catch(() => []);
    // network refusal happens BEFORE tempdir creation so baseDir may be unborn,
    // but if it exists it must be empty.
    expect(remaining).toEqual([]);
  });
});

describe('assertSafeRelativePath', () => {
  it('rejects empty paths', () => {
    expect(() => assertSafeRelativePath('')).toThrow(LocalFsSandboxPathError);
  });
  it('rejects absolute paths', () => {
    expect(() => assertSafeRelativePath('/etc/passwd')).toThrow(LocalFsSandboxPathError);
  });
  it('rejects paths with .. segments', () => {
    expect(() => assertSafeRelativePath('foo/../bar')).toThrow(LocalFsSandboxPathError);
    expect(() => assertSafeRelativePath('../bar')).toThrow(LocalFsSandboxPathError);
  });
  it('rejects NUL bytes', () => {
    expect(() => assertSafeRelativePath('foo\0bar')).toThrow(LocalFsSandboxPathError);
  });
  it('accepts simple relative paths', () => {
    expect(() => assertSafeRelativePath('a.txt')).not.toThrow();
    expect(() => assertSafeRelativePath('subdir/file.py')).not.toThrow();
  });
});
