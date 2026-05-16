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
import { derivePrereqsPlans } from '../src/validator/sandbox.js';

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

  it('sandbox layer emits a canonical-prereqs plan for each runner-gated stage', async () => {
    const loaded = await loadPackage(FIXTURE);
    const r = await validateSandbox(loaded);
    // Sample fixture has exactly one runner-gated stage (S001, mode=replay)
    // with no prior runner-gated stages.
    const plans = r.info.filter((i) => i.code === 'sandbox.canonical.prereqs.plan');
    expect(plans.length).toBe(1);
    expect(plans[0]?.ref).toBe('S001');
    expect(plans[0]?.message).toContain('no prior runner-gated stages');
  });

  it('sandbox layer emits an output_paths plan for each runner-gated stage with outputs', async () => {
    const loaded = await loadPackage(FIXTURE);
    const r = await validateSandbox(loaded);
    const outs = r.info.filter((i) => i.code === 'sandbox.output_paths.plan');
    expect(outs.length).toBe(1);
    expect(outs[0]?.ref).toBe('S001');
    expect(outs[0]?.message).toContain('workspace/out/s001.json');
    // No missing-warning when output_paths is declared.
    expect(r.warnings.some((w) => w.code === 'sandbox.output_paths.missing')).toBe(false);
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

  it('derivePrereqsPlans walks unlocks + unlocks_by_choice and filters runner mode != none', () => {
    // Synthetic graph: S001 (runner) -> S002 (none) -> S003 (runner, via
    // choice) -> S004 (runner). S005 (runner) is a parallel branch only
    // reachable via choice-b so it must not appear in S004's prereqs.
    const loaded = {
      root: '/tmp/synthetic',
      package: { slug: 'synthetic' } as never,
      graph: {
        nodes: [
          { id: 'N001', type: 'framing', title: 't', stage: 'curriculum/stages/001.yaml', unlocks: ['N002'] },
          { id: 'N002', type: 'analysis', title: 't', stage: 'curriculum/stages/002.yaml', unlocks: ['N003'] },
          {
            id: 'N003',
            type: 'decision',
            title: 't',
            stage: 'curriculum/stages/003.yaml',
            unlocks_by_choice: { 'choice-a': ['N004'], 'choice-b': ['N005'] },
          },
          { id: 'N004', type: 'implementation', title: 't', stage: 'curriculum/stages/004.yaml' },
          { id: 'N005', type: 'implementation', title: 't', stage: 'curriculum/stages/005.yaml' },
        ],
      } as never,
      stages: [
        { ref: 'curriculum/stages/001.yaml', path: '/x/001.yaml', data: { id: 'S001' } as never },
        { ref: 'curriculum/stages/002.yaml', path: '/x/002.yaml', data: { id: 'S002' } as never },
        { ref: 'curriculum/stages/003.yaml', path: '/x/003.yaml', data: { id: 'S003' } as never },
        { ref: 'curriculum/stages/004.yaml', path: '/x/004.yaml', data: { id: 'S004' } as never },
        { ref: 'curriculum/stages/005.yaml', path: '/x/005.yaml', data: { id: 'S005' } as never },
      ],
      branches: [],
      rubrics: [],
      hints: [],
      runner: {
        image: 'x',
        default_mode: 'test',
        network: 'none',
        resources: { cpu: 1, memory_mb: 256, wall_clock_seconds: 30 },
        stages: {
          S001: { mode: 'test' },
          S002: { mode: 'none' },
          S003: { mode: 'test' },
          S004: { mode: 'test' },
          S005: { mode: 'test' },
        },
      } as never,
      solutions: { canonicalFiles: ['solutions/canonical/x.md'], branchFiles: [] },
      artifact: { paperMd: null, logicFiles: [], srcFiles: [], traceTreePath: null, evidencePaths: [] },
    };

    const plans = derivePrereqsPlans(loaded as never);
    const byStage = new Map(plans.map((p) => [p.stageId, p.requiredStageIds]));
    expect(byStage.get('S001')).toEqual([]);
    // S002 is runner mode=none so it is excluded entirely.
    expect(byStage.has('S002')).toBe(false);
    expect(byStage.get('S003')).toEqual(['S001']);
    // S004 reachable only via choice-a from N003; S005 is a sibling, not an
    // ancestor, and must not appear.
    expect(byStage.get('S004')).toEqual(['S001', 'S003']);
    expect(byStage.get('S005')).toEqual(['S001', 'S003']);
  });

  it('sandbox warns when a runner-gated stage declares no output_paths', async () => {
    const loaded = await loadPackage(FIXTURE);
    if (loaded.runner) {
      const stages = loaded.runner.stages as Record<
        string,
        { output_paths?: string[] }
      >;
      const s = stages['S001'];
      if (s) delete s.output_paths;
    }
    const r = await validateSandbox(loaded);
    const missing = r.warnings.filter((w) => w.code === 'sandbox.output_paths.missing');
    expect(missing.length).toBe(1);
    expect(missing[0]?.ref).toBe('S001');
    expect(r.info.some((i) => i.code === 'sandbox.output_paths.plan')).toBe(false);
  });

  it('sandbox rejects absolute or escaping output_paths entries', async () => {
    const loaded = await loadPackage(FIXTURE);
    if (loaded.runner) {
      const stages = loaded.runner.stages as Record<
        string,
        { output_paths?: string[] }
      >;
      const s = stages['S001'];
      if (s) s.output_paths = ['/etc/passwd', '../escape.json', 'workspace/out/ok.json'];
    }
    const r = await validateSandbox(loaded);
    const invalids = r.errors.filter((e) => e.code === 'sandbox.output_paths.invalid');
    expect(invalids.length).toBe(2);
    expect(invalids.every((e) => e.ref === 'S001')).toBe(true);
    // The one valid entry still surfaces in the plan info.
    const plan = r.info.find((i) => i.code === 'sandbox.output_paths.plan' && i.ref === 'S001');
    expect(plan?.message).toContain('workspace/out/ok.json');
  });

  it('sandbox warns when runner-gated stages exist but solutions/canonical is empty', async () => {
    const loaded = await loadPackage(FIXTURE);
    loaded.solutions = { ...loaded.solutions, canonicalFiles: [] };
    const r = await validateSandbox(loaded);
    expect(r.warnings.some((w) => w.code === 'sandbox.canonical.missing')).toBe(true);
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
