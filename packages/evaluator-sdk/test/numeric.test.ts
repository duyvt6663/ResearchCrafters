import { describe, expect, it } from 'vitest';
import {
  checkNumeric,
  checkNumericBatch,
  inferShape,
  metricsToObservations,
} from '../src/index.js';
import type { NumericCheckSpec } from '../src/index.js';

describe('checkNumeric — scalar', () => {
  it('passes when within absolute tolerance', () => {
    const spec: NumericCheckSpec = {
      id: 'latency_ms',
      expected: 12.0,
      tolerance: { absolute: 0.5 },
      unit: 'ms',
    };
    const r = checkNumeric({ value: 12.3, unit: 'ms' }, spec);
    expect(r.passed).toBe(true);
    expect(r.maxAbsError).toBeCloseTo(0.3, 6);
    expect(r.observedShape).toEqual([]);
    expect(r.observedUnit).toBe('ms');
  });

  it('fails value_mismatch when outside absolute tolerance', () => {
    const r = checkNumeric(
      { value: 13.0, unit: 'ms' },
      { id: 'x', expected: 12.0, tolerance: { absolute: 0.5 }, unit: 'ms' },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('value_mismatch');
    expect(r.maxAbsError).toBeCloseTo(1.0, 6);
  });

  it('honors relative tolerance', () => {
    const r = checkNumeric(
      { value: 101 },
      { id: 'x', expected: 100, tolerance: { relative: 0.02 } },
    );
    expect(r.passed).toBe(true);
    expect(r.maxRelError).toBeCloseTo(0.01, 6);
  });

  it('combined tolerance follows isclose semantics (atol + rtol*|e|)', () => {
    // diff=1, atol=0.5, rtol*|e|=0.5 -> bound=1.0 -> pass
    const r = checkNumeric(
      { value: 11 },
      { id: 'x', expected: 10, tolerance: { absolute: 0.5, relative: 0.05 } },
    );
    expect(r.passed).toBe(true);
  });

  it('fails when neither tolerance is provided', () => {
    const r = checkNumeric(
      { value: 1 },
      { id: 'x', expected: 1, tolerance: {} },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('spec_invalid');
  });

  it('rejects negative tolerances', () => {
    expect(
      checkNumeric(
        { value: 1 },
        { id: 'x', expected: 1, tolerance: { absolute: -0.1 } },
      ).reason,
    ).toBe('spec_invalid');
    expect(
      checkNumeric(
        { value: 1 },
        { id: 'x', expected: 1, tolerance: { relative: -0.1 } },
      ).reason,
    ).toBe('spec_invalid');
  });

  it('flags missing observation', () => {
    const r = checkNumeric(undefined, {
      id: 'x',
      expected: 1,
      tolerance: { absolute: 0.1 },
    });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('missing');
  });

  it('flags non-finite observations', () => {
    const r = checkNumeric(
      { value: Number.POSITIVE_INFINITY },
      { id: 'x', expected: 1, tolerance: { absolute: 0.1 } },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('not_finite');
  });
});

describe('checkNumeric — units', () => {
  it('fails when units mismatch', () => {
    const r = checkNumeric(
      { value: 1, unit: 's' },
      { id: 'x', expected: 1, tolerance: { absolute: 0.1 }, unit: 'ms' },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('unit_mismatch');
    expect(r.observedUnit).toBe('s');
  });

  it('fails when unit is required but absent', () => {
    const r = checkNumeric(
      { value: 1 },
      { id: 'x', expected: 1, tolerance: { absolute: 0.1 }, unit: 'ms' },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('unit_mismatch');
  });

  it('does not require unit when spec omits it', () => {
    const r = checkNumeric(
      { value: 1, unit: 'anything' },
      { id: 'x', expected: 1, tolerance: { absolute: 0.1 } },
    );
    expect(r.passed).toBe(true);
  });
});

describe('checkNumeric — shape and tensors', () => {
  it('infers scalar shape as []', () => {
    expect(inferShape(3)).toEqual([]);
  });

  it('infers vector and matrix shapes', () => {
    expect(inferShape([1, 2, 3])).toEqual([3]);
    expect(inferShape([[1, 2], [3, 4], [5, 6]])).toEqual([3, 2]);
  });

  it('passes element-wise vector check', () => {
    const r = checkNumeric(
      { value: [1.0, 2.001, 3.0] },
      { id: 'v', expected: [1, 2, 3], tolerance: { absolute: 0.01 }, shape: [3] },
    );
    expect(r.passed).toBe(true);
    expect(r.observedShape).toEqual([3]);
  });

  it('fails shape_mismatch when lengths differ', () => {
    const r = checkNumeric(
      { value: [1, 2] },
      { id: 'v', expected: [1, 2, 3], tolerance: { absolute: 0.01 } },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('shape_mismatch');
    expect(r.observedShape).toEqual([2]);
  });

  it('fails shape_mismatch when declared shape disagrees with observation', () => {
    const r = checkNumeric(
      { value: 3 },
      { id: 'v', expected: 3, tolerance: { absolute: 0.01 }, shape: [3] },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('spec_invalid');
  });

  it('detects ragged observation as shape_mismatch', () => {
    const r = checkNumeric(
      { value: [[1, 2], [3]] as never },
      { id: 'm', expected: [[1, 2], [3, 4]], tolerance: { absolute: 0.01 } },
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('shape_mismatch');
  });

  it('reports max abs error across tensor leaves', () => {
    const r = checkNumeric(
      { value: [[1, 2], [3, 5]] },
      {
        id: 'm',
        expected: [[1, 2], [3, 4]],
        tolerance: { absolute: 0.5 },
        shape: [2, 2],
      },
    );
    expect(r.passed).toBe(false);
    expect(r.maxAbsError).toBeCloseTo(1, 6);
  });
});

describe('checkNumericBatch', () => {
  it('aggregates passRatio and per-spec results', () => {
    const observations = {
      a: { value: 1.0 },
      b: { value: 2.5, unit: 'ms' },
    };
    const specs: NumericCheckSpec[] = [
      { id: 'a', expected: 1, tolerance: { absolute: 0.1 } },
      { id: 'b', expected: 2, tolerance: { absolute: 0.1 }, unit: 'ms' },
      { id: 'c', expected: 0, tolerance: { absolute: 0.1 } },
    ];
    const batch = checkNumericBatch(observations, specs);
    expect(batch.passed).toBe(false);
    expect(batch.results).toHaveLength(3);
    expect(batch.results[0]!.passed).toBe(true);
    expect(batch.results[1]!.passed).toBe(false);
    expect(batch.results[1]!.reason).toBe('value_mismatch');
    expect(batch.results[2]!.passed).toBe(false);
    expect(batch.results[2]!.reason).toBe('missing');
    expect(batch.passRatio).toBeCloseTo(1 / 3, 6);
  });

  it('passes when every spec passes', () => {
    const batch = checkNumericBatch(
      { a: { value: 1 }, b: { value: 2 } },
      [
        { id: 'a', expected: 1, tolerance: { absolute: 0.1 } },
        { id: 'b', expected: 2, tolerance: { absolute: 0.1 } },
      ],
    );
    expect(batch.passed).toBe(true);
    expect(batch.passRatio).toBe(1);
  });

  it('handles empty spec list', () => {
    const batch = checkNumericBatch({}, []);
    expect(batch.passed).toBe(false);
    expect(batch.passRatio).toBe(0);
  });
});

describe('metricsToObservations', () => {
  it('maps metrics into observations with unit hints', () => {
    const obs = metricsToObservations(
      { latency: 12, accuracy: 0.91 },
      { latency: 'ms' },
    );
    expect(obs.latency).toEqual({ value: 12, unit: 'ms' });
    expect(obs.accuracy).toEqual({ value: 0.91 });
  });

  it('returns empty when metrics is undefined', () => {
    expect(metricsToObservations(undefined)).toEqual({});
  });
});
