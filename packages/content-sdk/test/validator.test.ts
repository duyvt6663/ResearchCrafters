import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import {
  validatePackage,
  validateStructural,
  loadPackage,
  validateAraCrossLink,
  validateSandbox,
  validatePedagogy,
  buildPackageManifest,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'sample-package');

describe('validatePackage on fixture', () => {
  it('passes structural validation', async () => {
    const r = await validateStructural(FIXTURE);
    expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([]);
  });

  it('loads the package', async () => {
    const loaded = await loadPackage(FIXTURE);
    expect(loaded.package.slug).toBe('sample-pkg');
    expect(loaded.stages.length).toBeGreaterThanOrEqual(3);
    expect(loaded.branches.length).toBe(1);
    expect(loaded.rubrics.length).toBe(1);
    expect(loaded.runner).not.toBeNull();
  });

  it('passes ARA cross-link validation', async () => {
    const loaded = await loadPackage(FIXTURE);
    const r = await validateAraCrossLink(loaded);
    expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([]);
  });

  it('sandbox layer reports pending and verifies fixture hash', async () => {
    const loaded = await loadPackage(FIXTURE);
    const r = await validateSandbox(loaded);
    expect(r.errors).toEqual([]);
    expect(r.info.some((i) => i.code === 'sandbox.pending')).toBe(true);
  });

  it('passes pedagogy validation', async () => {
    const loaded = await loadPackage(FIXTURE);
    const r = await validatePedagogy(loaded);
    expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([]);
  });

  it('end-to-end validatePackage returns ok=true', async () => {
    const r = await validatePackage(FIXTURE);
    expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('builds a manifest', async () => {
    const loaded = await loadPackage(FIXTURE);
    const manifest = buildPackageManifest(loaded);
    expect(manifest.package.slug).toBe('sample-pkg');
    expect(manifest.graphNodes.length).toBe(3);
    expect(manifest.stages.length).toBeGreaterThanOrEqual(3);
    expect(manifest.branches.length).toBe(1);
    expect(manifest.fixtures.length).toBe(1);
    expect(manifest.fixtures[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('validatePackage detects errors', () => {
  it('detects missing required file', async () => {
    const tmpRoot = path.join(__dirname, 'fixtures', '.tmp-broken');
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.mkdir(tmpRoot, { recursive: true });
    const r = await validatePackage(tmpRoot);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'file.missing')).toBe(true);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('detects fixture hash mismatch', async () => {
    const loaded = await loadPackage(FIXTURE);
    if (loaded.runner) {
      const stages = loaded.runner.stages as Record<
        string,
        { fixtures?: { path: string; sha256: string }[] }
      >;
      const stage = stages['S001'];
      const fixture = stage?.fixtures?.[0];
      if (fixture) {
        fixture.sha256 = 'deadbeef'.repeat(8);
      }
    }
    const r = await validateSandbox(loaded);
    expect(r.errors.some((e) => e.code === 'fixture.hash_mismatch')).toBe(true);
  });
});
