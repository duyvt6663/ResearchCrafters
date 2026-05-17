import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPackage } from '../src/loader.js';
import { buildPackageManifest } from '../src/build.js';
import { computeManifestSourceHash } from '../src/source-hash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, 'fixtures', 'sample-package');

describe('computeManifestSourceHash', () => {
  it('returns a sha256:-prefixed hex digest', async () => {
    const loaded = await loadPackage(FIXTURE);
    const manifest = buildPackageManifest(loaded);
    const hash = computeManifestSourceHash(manifest);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is deterministic across repeated builds of the same package', async () => {
    const loaded = await loadPackage(FIXTURE);
    const a = computeManifestSourceHash(buildPackageManifest(loaded));
    const b = computeManifestSourceHash(buildPackageManifest(loaded));
    expect(a).toEqual(b);
  });

  it('is insensitive to top-level object key order', async () => {
    const loaded = await loadPackage(FIXTURE);
    const manifest = buildPackageManifest(loaded);
    // Reconstruct the same manifest with reversed key insertion order.
    const reordered = Object.fromEntries(
      Object.entries(manifest).reverse(),
    ) as typeof manifest;
    expect(computeManifestSourceHash(reordered)).toEqual(
      computeManifestSourceHash(manifest),
    );
  });

  it('changes when manifest content changes', async () => {
    const loaded = await loadPackage(FIXTURE);
    const manifest = buildPackageManifest(loaded);
    const before = computeManifestSourceHash(manifest);
    const mutated = {
      ...manifest,
      package: { ...manifest.package, title: manifest.package.title + ' (edit)' },
    };
    expect(computeManifestSourceHash(mutated)).not.toEqual(before);
  });
});
