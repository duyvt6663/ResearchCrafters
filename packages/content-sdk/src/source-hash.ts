import { createHash } from 'node:crypto';
import type { PackageBuildManifest } from './types.js';

// Canonical algorithm for the `PackageVersion.sourceHash` column.
//
// The hash must be deterministic so that re-running `researchcrafters build`
// against unchanged package YAML yields the same value, and the DB mirror
// step (`packages/db/src/seed.ts`) can no-op when nothing changed. We
// serialize with sorted object keys to avoid hash drift from non-canonical
// key order in JSON.stringify.
export function computeManifestSourceHash(
  manifest: PackageBuildManifest,
): string {
  return `sha256:${createHash('sha256').update(stableJson(manifest)).digest('hex')}`;
}

export function stableJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableJson(v)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
