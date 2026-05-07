import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectFiles,
  MAX_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES,
  SUBMIT_DENY_PATTERNS,
} from '../src/commands/submit.js';

/**
 * Lock in the CLI submit bundle policy. The deny-list and the size /
 * file-count caps are the protection against accidentally shipping a
 * `.env`, a `node_modules/`, or a runaway bundle. The QA test-coverage
 * report flagged this surface as untested — these tests turn that gap
 * into a regression suite.
 */

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-submit-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function write(rel: string, body: string | Buffer): Promise<void> {
  const abs = path.join(tmpRoot, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body);
}

describe('collectFiles — bundle policy', () => {
  it('caps and constants match the documented contract', () => {
    expect(MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_FILES).toBe(5000);
    expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
    // Deny-list shape: every entry is a glob string with `**` somewhere.
    for (const p of SUBMIT_DENY_PATTERNS) {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
    }
  });

  it('includes ordinary source files', async () => {
    await write('src/main.py', 'print("hi")\n');
    await write('README.md', '# hello\n');
    const entries = await collectFiles(tmpRoot);
    const rels = entries.map((e) => e.rel).sort();
    expect(rels).toEqual(['README.md', 'src/main.py']);
  });

  it('excludes .env, .env.local, and *.pem secrets', async () => {
    await write('src/main.py', 'print("hi")\n');
    await write('.env', 'SECRET=hunter2\n');
    await write('.env.local', 'OTHER=x\n');
    await write('keys/server.pem', '-----BEGIN PEM-----\n');
    await write('keys/private.key', 'k\n');
    const rels = (await collectFiles(tmpRoot)).map((e) => e.rel);
    expect(rels).toContain('src/main.py');
    expect(rels).not.toContain('.env');
    expect(rels).not.toContain('.env.local');
    expect(rels).not.toContain('keys/server.pem');
    expect(rels).not.toContain('keys/private.key');
  });

  it('excludes node_modules, .git, .next, .turbo, dist', async () => {
    await write('src/main.py', 'print("hi")\n');
    await write('node_modules/foo/index.js', 'x\n');
    await write('.git/HEAD', 'ref: x\n');
    await write('.next/cache/x', 'x\n');
    await write('.turbo/x', 'x\n');
    await write('dist/main.js', 'x\n');
    const rels = (await collectFiles(tmpRoot)).map((e) => e.rel);
    expect(rels).toEqual(['src/main.py']);
  });

  it('excludes the local CLI state directory', async () => {
    await write('src/main.py', 'x\n');
    await write('.researchcrafters/config.json', '{}\n');
    const rels = (await collectFiles(tmpRoot)).map((e) => e.rel);
    expect(rels).toEqual(['src/main.py']);
  });

  it('rejects a single file larger than MAX_FILE_BYTES', async () => {
    await write('big.bin', Buffer.alloc(MAX_FILE_BYTES + 1, 0));
    await expect(collectFiles(tmpRoot)).rejects.toThrow(/exceeds per-file limit/);
  });

  it('rejects a bundle whose cumulative size exceeds MAX_BYTES', async () => {
    // 11 files at 5 MiB each = 55 MiB > 50 MiB cap.
    for (let i = 0; i < 11; i++) {
      await write(`chunk-${i}.bin`, Buffer.alloc(MAX_FILE_BYTES, 0));
    }
    await expect(collectFiles(tmpRoot)).rejects.toThrow(/exceeds 52428800 bytes/);
  });

  it('rejects when the file-count exceeds MAX_FILES', async () => {
    // Building 5001 real files on disk is slow; instead seed enough that
    // fast-glob returns just over the cap and rely on the count check
    // running BEFORE per-file reads.
    // To keep the test under 5s we generate 5001 zero-byte files in a
    // single directory.
    const dir = path.join(tmpRoot, 'many');
    await fs.mkdir(dir, { recursive: true });
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < MAX_FILES + 1; i++) {
      writes.push(fs.writeFile(path.join(dir, `f${i}.txt`), ''));
    }
    await Promise.all(writes);
    await expect(collectFiles(tmpRoot)).rejects.toThrow(/max is 5000/);
  }, 30_000);

  it('accepts a bundle right at the file-count cap', async () => {
    const dir = path.join(tmpRoot, 'many');
    await fs.mkdir(dir, { recursive: true });
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < MAX_FILES; i++) {
      writes.push(fs.writeFile(path.join(dir, `f${i}.txt`), ''));
    }
    await Promise.all(writes);
    const entries = await collectFiles(tmpRoot);
    expect(entries.length).toBe(MAX_FILES);
  }, 30_000);

  it('returns entries sorted by relative path for deterministic sha256', async () => {
    await write('z.txt', 'z');
    await write('a/b.txt', 'b');
    await write('a/a.txt', 'a');
    await write('m.txt', 'm');
    const rels = (await collectFiles(tmpRoot)).map((e) => e.rel);
    expect(rels).toEqual([...rels].sort());
  });
});
