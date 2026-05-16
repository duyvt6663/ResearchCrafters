/**
 * Implementation-linked math stage checks: shape tables and
 * memory/complexity bounds.
 *
 * Math stages that ship an implementation (the learner submits runnable code
 * and the runner produces metrics + per-tensor shape probes) need two
 * deterministic gates layered on top of the equality-with-tolerance
 * primitive in `numeric.ts`:
 *
 *   1. **Shape table** — a named map `{ tensor_name: expected_shape }` that
 *      the learner's implementation must match exactly. This is the gate
 *      math stages with layer-by-layer derivations rely on (e.g. "the
 *      residual block must emit a `[B, 64, 32, 32]` tensor").
 *
 *   2. **Complexity / memory bounds** — one-sided or two-sided scalar
 *      bounds on resource metrics (`params`, `peak_memory_bytes`,
 *      `flops`, `runtime_ms`). Unlike `checkNumeric`, these are
 *      *inequality* gates, not equality-with-tolerance.
 *
 * Both helpers consume the same `NumericObservation` shape as `numeric.ts`
 * for memory/complexity metrics, and a plain `Record<string, number[]>` for
 * shapes. Callers wire authored specs through `gradeAttempt`'s
 * `scoreDimensions` callback; a future stage-schema field will surface them
 * declaratively.
 */

import type { NumericObservation } from './numeric.js';

// ---------------------------------------------------------------------------
// Shape table
// ---------------------------------------------------------------------------

export interface ShapeTableSpec {
  /** Map of tensor name -> expected shape. Empty array means scalar. */
  expected: Readonly<Record<string, ReadonlyArray<number>>>;
  /**
   * Whether observed shapes may contain names not in `expected`.
   * Default `false`: unexpected entries are reported as failures.
   */
  allowExtra?: boolean;
}

export type ShapeTableEntryStatus =
  | 'ok'
  | 'missing'
  | 'shape_mismatch'
  | 'unexpected'
  | 'spec_invalid';

export interface ShapeTableEntryResult {
  name: string;
  status: ShapeTableEntryStatus;
  expectedShape?: ReadonlyArray<number>;
  observedShape?: ReadonlyArray<number>;
  message?: string;
}

export interface ShapeTableResult {
  passed: boolean;
  entries: ShapeTableEntryResult[];
  /** Fraction of expected entries that matched (`unexpected` not counted). */
  passRatio: number;
}

function isNonNegativeIntArray(v: unknown): v is number[] {
  if (!Array.isArray(v)) return false;
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0) return false;
  }
  return true;
}

function shapesEqual(a: ReadonlyArray<number>, b: ReadonlyArray<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Validate a learner's observed shape map against an authored shape table.
 * The returned `entries` array is stable: one entry per expected name in
 * authored order, followed by `unexpected` entries in observed order.
 */
export function checkShapeTable(
  observed: Readonly<Record<string, ReadonlyArray<number>>> | undefined,
  spec: ShapeTableSpec,
): ShapeTableResult {
  const obs = observed ?? {};
  const entries: ShapeTableEntryResult[] = [];
  let expectedCount = 0;
  let okCount = 0;

  for (const [name, expectedShape] of Object.entries(spec.expected)) {
    expectedCount += 1;
    if (!isNonNegativeIntArray(expectedShape)) {
      entries.push({
        name,
        status: 'spec_invalid',
        expectedShape,
        message: `expected shape for '${name}' must be an array of non-negative integers`,
      });
      continue;
    }
    const observedShape = obs[name];
    if (observedShape === undefined) {
      entries.push({
        name,
        status: 'missing',
        expectedShape,
        message: `no observed shape for '${name}'`,
      });
      continue;
    }
    if (!isNonNegativeIntArray(observedShape as number[])) {
      entries.push({
        name,
        status: 'shape_mismatch',
        expectedShape,
        observedShape,
        message: `observed shape for '${name}' is not an array of non-negative integers`,
      });
      continue;
    }
    if (!shapesEqual(observedShape, expectedShape)) {
      entries.push({
        name,
        status: 'shape_mismatch',
        expectedShape,
        observedShape,
        message: `expected shape [${expectedShape.join(',')}], got [${observedShape.join(',')}]`,
      });
      continue;
    }
    entries.push({
      name,
      status: 'ok',
      expectedShape,
      observedShape,
    });
    okCount += 1;
  }

  if (!spec.allowExtra) {
    for (const [name, observedShape] of Object.entries(obs)) {
      if (name in spec.expected) continue;
      entries.push({
        name,
        status: 'unexpected',
        observedShape,
        message: `observed shape '${name}' is not declared in the shape table`,
      });
    }
  }

  const hasUnexpected = entries.some((e) => e.status === 'unexpected');
  const passed =
    expectedCount > 0 && okCount === expectedCount && !hasUnexpected;
  const passRatio = expectedCount === 0 ? 0 : okCount / expectedCount;
  return { passed, entries, passRatio };
}

// ---------------------------------------------------------------------------
// Complexity / memory bounds
// ---------------------------------------------------------------------------

export interface ComplexityBoundSpec {
  id: string;
  label?: string;
  /** Upper bound (inclusive). At least one of `max`/`min` is required. */
  max?: number;
  /** Lower bound (inclusive). At least one of `max`/`min` is required. */
  min?: number;
  /** Required unit label (string-equality) when set. */
  unit?: string;
}

export type ComplexityBoundFailureReason =
  | 'missing'
  | 'not_finite'
  | 'unit_mismatch'
  | 'above_max'
  | 'below_min'
  | 'not_scalar'
  | 'spec_invalid';

export interface ComplexityBoundResult {
  id: string;
  passed: boolean;
  observed?: number;
  observedUnit?: string;
  reason?: ComplexityBoundFailureReason;
  /** Absolute slack vs the binding bound: positive when inside, negative when over/under. */
  slack?: number;
  message?: string;
}

export interface ComplexityBoundBatch {
  passed: boolean;
  results: ComplexityBoundResult[];
  /** Fraction of specs that passed, in `[0,1]`. */
  passRatio: number;
}

/**
 * Check a scalar observation against a one- or two-sided bound. Useful for
 * `params <= 25_000_000`, `peak_memory_bytes <= 2 GiB`, or
 * `runtime_ms in [10, 200]` style gates.
 */
export function checkComplexityBound(
  observation: NumericObservation | undefined,
  spec: ComplexityBoundSpec,
): ComplexityBoundResult {
  if (spec.max === undefined && spec.min === undefined) {
    return {
      id: spec.id,
      passed: false,
      reason: 'spec_invalid',
      message: 'at least one of max or min is required',
    };
  }
  if (
    spec.max !== undefined &&
    spec.min !== undefined &&
    spec.max < spec.min
  ) {
    return {
      id: spec.id,
      passed: false,
      reason: 'spec_invalid',
      message: `max (${spec.max}) is below min (${spec.min})`,
    };
  }
  if (spec.max !== undefined && !Number.isFinite(spec.max)) {
    return {
      id: spec.id,
      passed: false,
      reason: 'spec_invalid',
      message: 'max must be a finite number',
    };
  }
  if (spec.min !== undefined && !Number.isFinite(spec.min)) {
    return {
      id: spec.id,
      passed: false,
      reason: 'spec_invalid',
      message: 'min must be a finite number',
    };
  }

  if (observation === undefined || observation.value === undefined) {
    return {
      id: spec.id,
      passed: false,
      reason: 'missing',
      message: `no observation for '${spec.id}'`,
    };
  }
  if (typeof observation.value !== 'number') {
    const base: ComplexityBoundResult = {
      id: spec.id,
      passed: false,
      reason: 'not_scalar',
      message: `complexity bound requires a scalar value for '${spec.id}'`,
    };
    if (observation.unit !== undefined) base.observedUnit = observation.unit;
    return base;
  }
  if (!Number.isFinite(observation.value)) {
    const base: ComplexityBoundResult = {
      id: spec.id,
      passed: false,
      observed: observation.value,
      reason: 'not_finite',
      message: `observed value for '${spec.id}' is not finite`,
    };
    if (observation.unit !== undefined) base.observedUnit = observation.unit;
    return base;
  }
  if (spec.unit !== undefined) {
    if (observation.unit === undefined || observation.unit !== spec.unit) {
      const base: ComplexityBoundResult = {
        id: spec.id,
        passed: false,
        observed: observation.value,
        reason: 'unit_mismatch',
        message: `expected unit '${spec.unit}', got '${observation.unit ?? '(none)'}'`,
      };
      if (observation.unit !== undefined) base.observedUnit = observation.unit;
      return base;
    }
  }

  const value = observation.value;
  if (spec.max !== undefined && value > spec.max) {
    const base: ComplexityBoundResult = {
      id: spec.id,
      passed: false,
      observed: value,
      reason: 'above_max',
      slack: spec.max - value,
      message: `observed ${value} exceeds max ${spec.max}`,
    };
    if (observation.unit !== undefined) base.observedUnit = observation.unit;
    return base;
  }
  if (spec.min !== undefined && value < spec.min) {
    const base: ComplexityBoundResult = {
      id: spec.id,
      passed: false,
      observed: value,
      reason: 'below_min',
      slack: value - spec.min,
      message: `observed ${value} is below min ${spec.min}`,
    };
    if (observation.unit !== undefined) base.observedUnit = observation.unit;
    return base;
  }

  // Slack = distance to the binding edge (the tighter of the two when both set).
  let slack: number | undefined;
  if (spec.max !== undefined && spec.min !== undefined) {
    slack = Math.min(spec.max - value, value - spec.min);
  } else if (spec.max !== undefined) {
    slack = spec.max - value;
  } else if (spec.min !== undefined) {
    slack = value - spec.min;
  }

  const base: ComplexityBoundResult = {
    id: spec.id,
    passed: true,
    observed: value,
  };
  if (slack !== undefined) base.slack = slack;
  if (observation.unit !== undefined) base.observedUnit = observation.unit;
  return base;
}

/**
 * Batch helper: run a set of complexity bounds and aggregate a pass ratio.
 */
export function checkComplexityBatch(
  observations: Readonly<Record<string, NumericObservation>>,
  specs: ReadonlyArray<ComplexityBoundSpec>,
): ComplexityBoundBatch {
  const results = specs.map((spec) =>
    checkComplexityBound(observations[spec.id], spec),
  );
  const passedCount = results.filter((r) => r.passed).length;
  return {
    passed: results.length > 0 && passedCount === results.length,
    results,
    passRatio: results.length === 0 ? 0 : passedCount / results.length,
  };
}
