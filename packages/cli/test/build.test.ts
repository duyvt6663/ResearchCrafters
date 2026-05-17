import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Stub validation so this test exercises only the build-output contract
// (manifest.json + source-hash.txt) and not the orthogonal pedagogy
// validator, which has its own dedicated suite.
vi.mock('@researchcrafters/content-sdk', async () => {
  const actual = await vi.importActual<
    typeof import('@researchcrafters/content-sdk')
  >('@researchcrafters/content-sdk');
  return {
    ...actual,
    validatePackage: async () => ({
      ok: true,
      errors: [],
      warnings: [],
      info: [],
    }),
  };
});

import {
  loadPackage,
  buildPackageManifest,
  computeManifestSourceHash,
} from '@researchcrafters/content-sdk';

import { buildCommand } from '../src/commands/build.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'content-sdk',
  'test',
  'fixtures',
  'sample-package',
);

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-build-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe('researchcrafters build', () => {
  it('writes manifest.json and source-hash.txt to the output dir', async () => {
    const outDir = await makeTempDir();
    const artifacts = await buildCommand(FIXTURE, { outDir });

    expect(artifacts.manifestPath).toEqual(path.join(outDir, 'manifest.json'));
    expect(artifacts.sourceHashPath).toEqual(
      path.join(outDir, 'source-hash.txt'),
    );
    expect(artifacts.sourceHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const onDiskHash = (
      await fs.readFile(artifacts.sourceHashPath, 'utf8')
    ).trim();
    expect(onDiskHash).toEqual(artifacts.sourceHash);

    const manifestText = await fs.readFile(artifacts.manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText);
    expect(manifest.package?.slug).toBeTruthy();
  });

  it('emits the same source hash as the content-sdk helper', async () => {
    const outDir = await makeTempDir();
    const artifacts = await buildCommand(FIXTURE, { outDir });

    const loaded = await loadPackage(FIXTURE);
    const expected = computeManifestSourceHash(buildPackageManifest(loaded));
    expect(artifacts.sourceHash).toEqual(expected);
  });

  it('produces a deterministic source hash across repeated builds', async () => {
    const a = await buildCommand(FIXTURE, { outDir: await makeTempDir() });
    const b = await buildCommand(FIXTURE, { outDir: await makeTempDir() });
    expect(a.sourceHash).toEqual(b.sourceHash);
  });
});
