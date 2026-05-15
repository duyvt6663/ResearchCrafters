import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { MockLLMGateway } from '@researchcrafters/ai';
import {
  validatePackage,
  validateStructural,
  loadPackage,
  validateAraCrossLink,
  validateSandbox,
  validatePedagogy,
  buildPackageManifest,
} from '../src/index.js';

/**
 * Clean-refusal gateway used for structural pedagogy tests. The default mock
 * gateway in `leak-tests.ts` deliberately ECHOES the first redaction target on
 * the `direct-ask` default attack — this is a regression test of the leak
 * matcher, not a stand-in for a real model. Tests that want to assert "the
 * structural pedagogy validator returns no errors" need a gateway that
 * returns a clean refusal so the default-attack battery (which now always
 * runs alongside authored attacks) does not produce a leak.
 */
function cleanRefusalGateway(): MockLLMGateway {
  return new MockLLMGateway(() => "I will not disclose hidden material.");
}

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
    const r = await validatePedagogy(loaded, {
      // Pass a clean-refusal gateway so the default-attack battery (now run on
      // every stage in addition to authored attacks) does not trip the
      // deterministic mock's `direct-ask` echo behaviour.
      leakTestGatewayFactory: () => cleanRefusalGateway(),
    });
    expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([]);
  });

  it('end-to-end validatePackage returns ok=true', async () => {
    const r = await validatePackage(FIXTURE, {
      leakTestGatewayFactory: () => cleanRefusalGateway(),
    });
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

  it('flags missing required field on the deliberately-invalid fixture', async () => {
    const INVALID = path.join(__dirname, 'fixtures', 'invalid-package');
    const r = await validatePackage(INVALID);
    expect(r.ok).toBe(false);
    // Package YAML drops `paper.title`, which the package schema requires —
    // so we expect a structural schema.invalid issue scoped to package.yaml.
    const structural = r.errors.filter(
      (e) => e.layer === 'structural' && e.code.startsWith('schema.'),
    );
    expect(structural.length).toBeGreaterThanOrEqual(1);
    const titleIssue = structural.find(
      (e) => e.path === 'package.yaml' && (e.ref ?? '').includes('paper.title'),
    );
    expect(titleIssue, JSON.stringify(structural, null, 2)).toBeDefined();
  });

  it('flags trace exploration_tree dangling parents, edges, and branch_id', async () => {
    const SAMPLE = path.join(__dirname, 'fixtures', 'sample-package');
    const tmpRoot = path.join(__dirname, 'fixtures', '.tmp-trace-bad');
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.cp(SAMPLE, tmpRoot, { recursive: true });
    const tracePath = path.join(tmpRoot, 'artifact', 'trace', 'exploration_tree.yaml');
    const badTrace = [
      'nodes:',
      '  - id: T001',
      '    refs:',
      '      - artifact/logic/problem.md',
      '    parents: [TGHOST]',
      '    children: [TMISSING]',
      '  - id: T002',
      '    kind: branch',
      '    branch_id: no-such-branch',
      '    parents: [T001]',
      '  - id: T003',
      '    kind: branch',
      '    branch_id: branch-a',
      '    parents: [T001]',
      '  - id: T004',
      '    kind: branch',
      '    branch_id: branch-a',
      '    parents: [T001]',
      'edges:',
      '  - from: T001',
      '    to: T002',
      '  - from: T001',
      '    to: TGHOST',
      '  - from: T002',
      '    to: T002',
      '',
    ].join('\n');
    await fs.writeFile(tracePath, badTrace, 'utf8');
    const loaded = await loadPackage(tmpRoot);
    const r = await validateAraCrossLink(loaded);
    const codes = new Set(r.errors.concat(r.warnings).map((i) => i.code));
    expect(codes.has('trace.parent.missing'), JSON.stringify([...codes])).toBe(true);
    expect(codes.has('trace.child.missing')).toBe(true);
    expect(codes.has('trace.edge.endpoint_missing')).toBe(true);
    expect(codes.has('trace.branch_id.unresolved')).toBe(true);
    expect(codes.has('trace.edge.self_loop')).toBe(true);
    expect(codes.has('trace.branch_id.duplicate')).toBe(true);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('warns when a curriculum branch has no trace branch node', async () => {
    const SAMPLE = path.join(__dirname, 'fixtures', 'sample-package');
    const tmpRoot = path.join(__dirname, 'fixtures', '.tmp-trace-unmapped');
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.cp(SAMPLE, tmpRoot, { recursive: true });
    // Sample fixture has branch-a in curriculum but no kind:branch trace node.
    const loaded = await loadPackage(tmpRoot);
    const r = await validateAraCrossLink(loaded);
    const unmapped = r.warnings.find(
      (w) => w.code === 'trace.branch.unmapped' && w.ref === 'branch-a',
    );
    expect(unmapped, JSON.stringify(r.warnings, null, 2)).toBeDefined();
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
