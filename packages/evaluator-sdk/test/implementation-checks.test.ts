import { describe, expect, it } from 'vitest';
import {
  checkShapeTable,
  checkComplexityBound,
  checkComplexityBatch,
} from '../src/index.js';
import type {
  ShapeTableSpec,
  ComplexityBoundSpec,
} from '../src/index.js';

describe('checkShapeTable', () => {
  const spec: ShapeTableSpec = {
    expected: {
      input: [1, 3, 32, 32],
      block1_out: [1, 64, 32, 32],
      logits: [1, 10],
    },
  };

  it('passes when every observed shape matches', () => {
    const r = checkShapeTable(
      {
        input: [1, 3, 32, 32],
        block1_out: [1, 64, 32, 32],
        logits: [1, 10],
      },
      spec,
    );
    expect(r.passed).toBe(true);
    expect(r.passRatio).toBe(1);
    expect(r.entries).toHaveLength(3);
    expect(r.entries.every((e) => e.status === 'ok')).toBe(true);
  });

  it('flags shape mismatches per entry', () => {
    const r = checkShapeTable(
      {
        input: [1, 3, 32, 32],
        block1_out: [1, 32, 32, 32], // wrong channel count
        logits: [1, 10],
      },
      spec,
    );
    expect(r.passed).toBe(false);
    const mis = r.entries.find((e) => e.name === 'block1_out');
    expect(mis?.status).toBe('shape_mismatch');
    expect(mis?.observedShape).toEqual([1, 32, 32, 32]);
    expect(mis?.expectedShape).toEqual([1, 64, 32, 32]);
    expect(r.passRatio).toBeCloseTo(2 / 3, 6);
  });

  it('flags missing observations', () => {
    const r = checkShapeTable({ input: [1, 3, 32, 32] }, spec);
    expect(r.passed).toBe(false);
    const missing = r.entries.filter((e) => e.status === 'missing');
    expect(missing.map((e) => e.name).sort()).toEqual(['block1_out', 'logits']);
  });

  it('reports unexpected observations by default', () => {
    const r = checkShapeTable(
      {
        input: [1, 3, 32, 32],
        block1_out: [1, 64, 32, 32],
        logits: [1, 10],
        debug_aux: [1, 1],
      },
      spec,
    );
    expect(r.passed).toBe(false);
    const extra = r.entries.find((e) => e.name === 'debug_aux');
    expect(extra?.status).toBe('unexpected');
  });

  it('tolerates extra observations when allowExtra is true', () => {
    const r = checkShapeTable(
      {
        input: [1, 3, 32, 32],
        block1_out: [1, 64, 32, 32],
        logits: [1, 10],
        debug_aux: [1, 1],
      },
      { ...spec, allowExtra: true },
    );
    expect(r.passed).toBe(true);
    expect(r.entries.some((e) => e.status === 'unexpected')).toBe(false);
  });

  it('handles scalar (rank-0) shapes', () => {
    const r = checkShapeTable(
      { loss: [] },
      { expected: { loss: [] } },
    );
    expect(r.passed).toBe(true);
  });

  it('rejects invalid expected shape entries as spec_invalid', () => {
    const r = checkShapeTable(
      { x: [1, 2] },
      // shape with a negative dim
      { expected: { x: [1, -2] as unknown as readonly number[] } },
    );
    expect(r.passed).toBe(false);
    expect(r.entries[0]?.status).toBe('spec_invalid');
  });

  it('returns passed=false when expected map is empty', () => {
    const r = checkShapeTable({}, { expected: {} });
    expect(r.passed).toBe(false);
    expect(r.passRatio).toBe(0);
  });

  it('treats missing observed map as all-missing', () => {
    const r = checkShapeTable(undefined, spec);
    expect(r.passed).toBe(false);
    expect(r.entries.every((e) => e.status === 'missing')).toBe(true);
  });
});

describe('checkComplexityBound — single', () => {
  it('passes when value is within an upper bound', () => {
    const r = checkComplexityBound(
      { value: 20_000_000, unit: 'params' },
      { id: 'params', max: 25_000_000, unit: 'params' },
    );
    expect(r.passed).toBe(true);
    expect(r.slack).toBe(5_000_000);
  });

  it('fails above_max with negative slack', () => {
    const r = checkComplexityBound(
      { value: 30_000_000 },
      { id: 'params', max: 25_000_000 },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('above_max');
    expect(r.slack).toBe(-5_000_000);
  });

  it('passes a two-sided bound and reports tightest slack', () => {
    const r = checkComplexityBound(
      { value: 150 },
      { id: 'runtime_ms', min: 100, max: 200 },
    );
    expect(r.passed).toBe(true);
    // distance to min=50, distance to max=50, tightest=50
    expect(r.slack).toBe(50);
  });

  it('fails below_min', () => {
    const r = checkComplexityBound(
      { value: 50 },
      { id: 'runtime_ms', min: 100, max: 200 },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('below_min');
  });

  it('rejects spec with neither bound', () => {
    const r = checkComplexityBound(
      { value: 1 },
      { id: 'x' } as ComplexityBoundSpec,
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('spec_invalid');
  });

  it('rejects spec where max < min', () => {
    const r = checkComplexityBound(
      { value: 1 },
      { id: 'x', min: 10, max: 5 },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('spec_invalid');
  });

  it('flags missing observations', () => {
    const r = checkComplexityBound(undefined, { id: 'x', max: 10 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('missing');
  });

  it('flags non-finite observations', () => {
    const r = checkComplexityBound(
      { value: Number.POSITIVE_INFINITY },
      { id: 'x', max: 10 },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('not_finite');
  });

  it('flags non-scalar values', () => {
    const r = checkComplexityBound(
      { value: [1, 2, 3] },
      { id: 'x', max: 10 },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('not_scalar');
  });

  it('enforces unit equality when authored', () => {
    const r = checkComplexityBound(
      { value: 1, unit: 'GB' },
      { id: 'mem', max: 2, unit: 'GiB' },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('unit_mismatch');
  });

  it('does not require unit when spec omits it', () => {
    const r = checkComplexityBound(
      { value: 1, unit: 'whatever' },
      { id: 'mem', max: 2 },
    );
    expect(r.passed).toBe(true);
    expect(r.observedUnit).toBe('whatever');
  });

  it('treats bound as inclusive at the edge', () => {
    expect(
      checkComplexityBound({ value: 10 }, { id: 'x', max: 10 }).passed,
    ).toBe(true);
    expect(
      checkComplexityBound({ value: 10 }, { id: 'x', min: 10 }).passed,
    ).toBe(true);
  });
});

describe('checkComplexityBatch', () => {
  it('aggregates results and passRatio', () => {
    const specs: ComplexityBoundSpec[] = [
      { id: 'params', max: 25_000_000 },
      { id: 'peak_memory_bytes', max: 2_147_483_648, unit: 'B' },
      { id: 'runtime_ms', min: 10, max: 200 },
    ];
    const obs = {
      params: { value: 24_000_000 },
      peak_memory_bytes: { value: 1_000_000_000, unit: 'B' },
      runtime_ms: { value: 5 }, // below min
    };
    const batch = checkComplexityBatch(obs, specs);
    expect(batch.passed).toBe(false);
    expect(batch.results).toHaveLength(3);
    expect(batch.results[0]?.passed).toBe(true);
    expect(batch.results[1]?.passed).toBe(true);
    expect(batch.results[2]?.passed).toBe(false);
    expect(batch.results[2]?.reason).toBe('below_min');
    expect(batch.passRatio).toBeCloseTo(2 / 3, 6);
  });

  it('passes when every bound passes', () => {
    const batch = checkComplexityBatch(
      { a: { value: 5 }, b: { value: 50 } },
      [
        { id: 'a', max: 10 },
        { id: 'b', min: 1, max: 100 },
      ],
    );
    expect(batch.passed).toBe(true);
    expect(batch.passRatio).toBe(1);
  });

  it('returns passed=false on empty spec list', () => {
    const batch = checkComplexityBatch({}, []);
    expect(batch.passed).toBe(false);
    expect(batch.passRatio).toBe(0);
  });
});
