import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  ErpParseError,
  branchSchema,
  graphSchema,
  hintSchema,
  packageSchema,
  parseYaml,
  rubricSchema,
  runnerSchema,
  stageSchema,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => resolve(here, 'fixtures', name);

describe('valid fixtures', () => {
  it('parses package.valid.yaml', () => {
    const pkg = parseYaml(fixture('package.valid.yaml'), packageSchema);
    expect(pkg.slug).toBe('flash-attention');
    expect(pkg.release.free_stage_ids).toEqual(['S001', 'S002']);
    expect(pkg.version).toBe('0.1.0');
  });

  it('parses graph.valid.yaml', () => {
    const graph = parseYaml(fixture('graph.valid.yaml'), graphSchema);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0]?.id).toBe('N001');
  });

  it('parses stage.valid.yaml', () => {
    const stage = parseYaml(fixture('stage.valid.yaml'), stageSchema);
    expect(stage.id).toBe('S001');
    expect(stage.stage_policy.mentor_visibility.canonical_solution).toBe('after_pass');
    expect(stage.stage_policy.pass_threshold).toBe(0.7);
  });

  it('parses branch.valid.yaml (inferred without source_refs)', () => {
    const branch = parseYaml(fixture('branch.valid.yaml'), branchSchema);
    expect(branch.support_level).toBe('inferred');
  });

  it('parses branch.explicit.valid.yaml (explicit with source_refs)', () => {
    const branch = parseYaml(fixture('branch.explicit.valid.yaml'), branchSchema);
    expect(branch.support_level).toBe('explicit');
    expect(branch.source_refs?.length).toBeGreaterThan(0);
  });

  it('parses rubric.valid.yaml', () => {
    const rubric = parseYaml(fixture('rubric.valid.yaml'), rubricSchema);
    expect(rubric.dimensions).toHaveLength(2);
    expect(rubric.pass_threshold).toBeCloseTo(0.7);
  });

  it('parses hint.valid.yaml', () => {
    const hint = parseYaml(fixture('hint.valid.yaml'), hintSchema);
    expect(hint.stage_id).toBe('S001');
    expect(hint.hints.length).toBeGreaterThan(0);
  });

  it('parses runner.valid.yaml', () => {
    const runner = parseYaml(fixture('runner.valid.yaml'), runnerSchema);
    expect(runner.network).toBe('none');
    expect(runner.stages.S001?.mode).toBe('replay');
  });
});

describe('negative fixtures', () => {
  it('rejects package with non-semver version', () => {
    expect(() => parseYaml(fixture('package.invalid.yaml'), packageSchema)).toThrow(
      ErpParseError,
    );
  });

  it('rejects graph with invalid node type', () => {
    expect(() => parseYaml(fixture('graph.invalid.yaml'), graphSchema)).toThrow(
      ErpParseError,
    );
  });

  it('rejects stage missing pass_threshold when after_pass is used', () => {
    expect(() =>
      parseYaml(fixture('stage.missing-pass-threshold.yaml'), stageSchema),
    ).toThrow(ErpParseError);
  });

  it('rejects branch with support_level=explicit and no source_refs', () => {
    expect(() =>
      parseYaml(fixture('branch.explicit.invalid.yaml'), branchSchema),
    ).toThrow(ErpParseError);
  });

  it('rejects missing required field', () => {
    const result = packageSchema.safeParse({ slug: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid mentor_visibility enum', () => {
    const result = stageSchema.safeParse({
      id: 'S1',
      title: 't',
      type: 'framing',
      difficulty: 'easy',
      estimated_time_minutes: 1,
      artifact_refs: [],
      task: { prompt_md: 'do' },
      stage_policy: {
        mentor_visibility: {
          stage_copy: 'sometimes',
          artifact_refs: 'always',
          rubric: 'always',
          evidence: 'always',
          branch_feedback: 'always',
          canonical_solution: 'always',
          branch_solutions: 'never',
        },
        runner: { mode: 'none' },
        validation: { kind: 'test' },
        inputs: { mode: 'free_text' },
        feedback: {},
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('schema decisions (PRD reconciliation)', () => {
  // Helper: a minimal valid stage authored in the PRD top-level shape.
  function topLevelStage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'S1',
      title: 't',
      type: 'framing',
      difficulty: 'very_easy',
      estimated_time_minutes: 1,
      artifact_refs: [],
      task: { prompt_md: 'do the thing' },
      validation: { kind: 'rubric' },
      inputs: { mode: 'free_text' },
      runner: { mode: 'none', config: 'workspace/runner.yaml' },
      feedback: {},
      stage_policy: {
        mentor_visibility: {
          stage_copy: 'always',
          artifact_refs: 'always',
          rubric: 'always',
          evidence: 'always',
          branch_feedback: 'always',
          canonical_solution: 'always',
          branch_solutions: 'never',
        },
      },
      ...overrides,
    };
  }

  it('package.difficulty accepts the PRD vocabulary (advanced)', () => {
    const ok = packageSchema.safeParse({
      slug: 'x',
      title: 'X',
      paper: { title: 'p', authors: [], year: 2020, arxiv: '' },
      status: 'alpha',
      difficulty: 'advanced',
      estimated_time_minutes: 60,
      skills: [],
      prerequisites: [],
      release: { free_stage_ids: [], requires_gpu: false },
      review: {},
      version: '0.1.0',
    });
    expect(ok.success).toBe(true);
  });

  it('package.difficulty still accepts the legacy stage vocabulary (easy)', () => {
    const ok = packageSchema.safeParse({
      slug: 'x',
      title: 'X',
      paper: { title: 'p', authors: [], year: 2020, arxiv: '' },
      status: 'alpha',
      difficulty: 'easy',
      estimated_time_minutes: 60,
      skills: [],
      prerequisites: [],
      release: { free_stage_ids: [], requires_gpu: false },
      review: {},
      version: '0.1.0',
    });
    expect(ok.success).toBe(true);
  });

  it('stage.difficulty rejects the package vocabulary (advanced)', () => {
    const bad = stageSchema.safeParse(topLevelStage({ difficulty: 'advanced' }));
    expect(bad.success).toBe(false);
  });

  it('lifts top-level validation/inputs/feedback/runner into stage_policy', () => {
    const r = stageSchema.safeParse(topLevelStage());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stage_policy.validation.kind).toBe('rubric');
      expect(r.data.stage_policy.inputs.mode).toBe('free_text');
      expect(r.data.stage_policy.runner.mode).toBe('none');
      expect(r.data.stage_policy.feedback).toBeDefined();
    }
  });

  it('runner stage accepts command as a string', () => {
    const ok = runnerSchema.safeParse({
      image: 'researchcrafters/runner:python-3.11',
      default_mode: 'test',
      resources: { cpu: 2, memory_mb: 2048, wall_clock_seconds: 60 },
      network: 'none',
      stages: {
        S1: { mode: 'test', command: 'pytest -q' },
      },
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.stages.S1?.command).toBe('pytest -q');
    }
  });

  it('runner stage accepts command as an array and normalizes to a single string', () => {
    const ok = runnerSchema.safeParse({
      image: 'researchcrafters/runner:python-3.11',
      default_mode: 'test',
      resources: { cpu: 2, memory_mb: 2048, wall_clock_seconds: 60 },
      network: 'none',
      stages: {
        S1: { mode: 'test', command: ['pytest', '-q', 'workspace/tests/test.py'] },
      },
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.stages.S1?.command).toBe('pytest -q workspace/tests/test.py');
    }
  });

  it('runner mode:none allows omitting command', () => {
    const ok = runnerSchema.safeParse({
      image: 'researchcrafters/runner:python-3.11',
      default_mode: 'test',
      resources: { cpu: 2, memory_mb: 2048, wall_clock_seconds: 60 },
      network: 'none',
      stages: {
        S1: { mode: 'none' },
      },
    });
    expect(ok.success).toBe(true);
  });

  it('runner mode:test without command fails', () => {
    const bad = runnerSchema.safeParse({
      image: 'researchcrafters/runner:python-3.11',
      default_mode: 'test',
      resources: { cpu: 2, memory_mb: 2048, wall_clock_seconds: 60 },
      network: 'none',
      stages: {
        S1: { mode: 'test' },
      },
    });
    expect(bad.success).toBe(false);
  });

  it('runner.resources rejects timeout_seconds in favor of wall_clock_seconds', () => {
    const bad = runnerSchema.safeParse({
      image: 'researchcrafters/runner:python-3.11',
      default_mode: 'test',
      resources: { cpu: 2, memory_mb: 2048, wall_clock_seconds: 60, timeout_seconds: 60 },
      network: 'none',
      stages: { S1: { mode: 'none' } },
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.some((i) => i.path.includes('timeout_seconds'))).toBe(true);
    }
  });

  it('runner stage rejects timeout_seconds in favor of wall_clock_seconds', () => {
    const bad = runnerSchema.safeParse({
      image: 'researchcrafters/runner:python-3.11',
      default_mode: 'test',
      resources: { cpu: 2, memory_mb: 2048, wall_clock_seconds: 60 },
      network: 'none',
      stages: {
        S1: { mode: 'test', command: 'pytest', timeout_seconds: 30 },
      },
    });
    expect(bad.success).toBe(false);
  });

  it('stage with inputs.mode=code requires runner.mode != none', () => {
    const bad = stageSchema.safeParse(
      topLevelStage({
        inputs: { mode: 'code' },
        runner: { mode: 'none' },
      }),
    );
    expect(bad.success).toBe(false);
  });

  it('rubric accepts authored shape (criteria + levels + 0..100 pass_threshold)', () => {
    const ok = rubricSchema.safeParse({
      id: 'rubric-x',
      total_points: 100,
      criteria: [
        {
          id: 'c1',
          title: 'C1',
          description: 'd',
          weight: 50,
          levels: [
            { score: 0, description: 'no' },
            { score: 50, description: 'partial' },
            { score: 100, description: 'full' },
          ],
        },
      ],
      pass_threshold: 60,
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.dimensions).toHaveLength(1);
      expect(ok.data.pass_threshold).toBeCloseTo(0.6);
    }
  });

  it('hint accepts authored levels[] shape', () => {
    const ok = hintSchema.safeParse({
      stage_id: 'S001',
      levels: [
        { level: 1, title: 't', body_md: 'b' },
        { level: 2, title: 't2', body_md: 'b2' },
      ],
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.hints.length).toBe(2);
      expect(ok.data.hints[0]?.body_md).toBe('b');
    }
  });
});
