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
