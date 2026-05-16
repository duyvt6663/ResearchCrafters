/**
 * Deterministic numeric checks with tolerance and unit/shape metadata.
 *
 * Math stages need a way to grade a learner's numeric answer against a known
 * expected value without sending the canonical answer through an LLM grader.
 * This module is the deterministic primitive that future math-grading rules
 * (per-step partial credit, shape-table checks, complexity proxies) compose
 * on top of.
 *
 * Design notes:
 * - Values are scalars, nested arrays, or `[REDACTED]` (regular tensors).
 * - Tolerance follows numpy `isclose` semantics when both `absolute` and
 *   `relative` are provided: `|a-e| <= absolute + relative * |e|`. When only
 *   one is provided, that one must hold. At least one must be set.
 * - Unit metadata is an opaque string label. Authors decide the vocabulary
 *   (`"ms"`, `"GB"`, `"tokens/s"`); the evaluator only enforces equality.
 * - Shape metadata can be authored or inferred. When authored, the observed
 *   shape must equal it exactly — this is the "shape table" gate that math
 *   stages with implementation hooks rely on.
 */

export interface NumericTolerance {
  /** Absolute tolerance: `|a-e| <= absolute`. */
  absolute?: number;
  /** Relative tolerance: `|a-e| <= relative * |e|`. */
  relative?: number;
}

export type NumericValue = number | NumericValue[];

export interface NumericCheckSpec {
  id: string;
  label?: string;
  expected: NumericValue;
  tolerance: NumericTolerance;
  /** Opaque unit label (e.g. `"ms"`, `"GB"`). When set, observed must match. */
  unit?: string;
  /** Expected tensor shape, e.g. `[2,3]` for a 2x3 matrix; omit/`[]` for scalar. */
  shape?: number[];
}

export type NumericCheckFailureReason =
  | 'unit_mismatch'
  | 'shape_mismatch'
  | 'value_mismatch'
  | 'missing'
  | 'not_finite'
  | 'spec_invalid';

export interface NumericObservation {
  value?: NumericValue;
  unit?: string;
}

export interface NumericCheckResult {
  id: string;
  passed: boolean;
  /** Worst-case absolute residual across all leaves. */
  maxAbsError?: number;
  /** Worst-case relative residual across leaves where `|expected| > 0`. */
  maxRelError?: number;
  observedShape?: number[];
  observedUnit?: string;
  reason?: NumericCheckFailureReason;
  message?: string;
}

export interface NumericCheckBatch {
  passed: boolean;
  results: NumericCheckResult[];
  /** Fraction of specs that passed, in `[0,1]`. */
  passRatio: number;
}

function inferShapeUnchecked(v: NumericValue): number[] {
  const dims: number[] = [];
  let cur: NumericValue = v;
  while (Array.isArray(cur)) {
    dims.push(cur.length);
    if (cur.length === 0) break;
    cur = cur[0] as NumericValue;
  }
  return dims;
}

export function inferShape(v: NumericValue): number[] {
  return inferShapeUnchecked(v);
}

function isUniformShape(v: NumericValue, shape: number[], depth = 0): boolean {
  if (depth === shape.length) {
    return typeof v === 'number';
  }
  if (!Array.isArray(v) || v.length !== shape[depth]) return false;
  return v.every((child) => isUniformShape(child as NumericValue, shape, depth + 1));
}

function shapesEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function walkPairs(
  observed: NumericValue,
  expected: NumericValue,
  visit: (o: number, e: number) => NumericCheckFailureReason | null,
): NumericCheckFailureReason | null {
  if (typeof observed === 'number' && typeof expected === 'number') {
    return visit(observed, expected);
  }
  if (Array.isArray(observed) && Array.isArray(expected)) {
    if (observed.length !== expected.length) return 'shape_mismatch';
    for (let i = 0; i < observed.length; i++) {
      const r = walkPairs(
        observed[i] as NumericValue,
        expected[i] as NumericValue,
        visit,
      );
      if (r) return r;
    }
    return null;
  }
  return 'shape_mismatch';
}

/**
 * Check a single numeric observation against its spec. The returned result is
 * always populated; `passed` and `reason` describe pass/fail mode.
 */
export function checkNumeric(
  observation: NumericObservation | undefined,
  spec: NumericCheckSpec,
): NumericCheckResult {
  const tol = spec.tolerance;
  if (tol.absolute === undefined && tol.relative === undefined) {
    return {
      id: spec.id,
      passed: false,
      reason: 'spec_invalid',
      message: 'tolerance must specify absolute or relative',
    };
  }
  if (tol.absolute !== undefined && tol.absolute < 0) {
    return {
      id: spec.id,
      passed: false,
      reason: 'spec_invalid',
      message: 'tolerance.absolute must be non-negative',
    };
  }
  if (tol.relative !== undefined && tol.relative < 0) {
    return {
      id: spec.id,
      passed: false,
      reason: 'spec_invalid',
      message: 'tolerance.relative must be non-negative',
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

  if (spec.unit !== undefined) {
    if (observation.unit === undefined || observation.unit !== spec.unit) {
      const result: NumericCheckResult = {
        id: spec.id,
        passed: false,
        reason: 'unit_mismatch',
        message: `expected unit '${spec.unit}', got '${observation.unit ?? '(none)'}'`,
      };
      if (observation.unit !== undefined) result.observedUnit = observation.unit;
      return result;
    }
  }

  const observedShape = inferShapeUnchecked(observation.value);
  if (!isUniformShape(observation.value, observedShape)) {
    return {
      id: spec.id,
      passed: false,
      reason: 'shape_mismatch',
      observedShape,
      message: `observed value for '${spec.id}' is not a uniform tensor`,
    };
  }

  const declaredShape = spec.shape;
  const expectedShape = inferShapeUnchecked(spec.expected);
  if (!isUniformShape(spec.expected, expectedShape)) {
    return {
      id: spec.id,
      passed: false,
      reason: 'spec_invalid',
      message: `expected value for '${spec.id}' is not a uniform tensor`,
    };
  }
  if (declaredShape !== undefined && !shapesEqual(declaredShape, expectedShape)) {
    return {
      id: spec.id,
      passed: false,
      reason: 'spec_invalid',
      message: `declared shape [${declaredShape.join(',')}] does not match expected literal shape [${expectedShape.join(',')}]`,
    };
  }
  const targetShape = declaredShape ?? expectedShape;
  if (!shapesEqual(observedShape, targetShape)) {
    return {
      id: spec.id,
      passed: false,
      reason: 'shape_mismatch',
      observedShape,
      message: `expected shape [${targetShape.join(',')}], got [${observedShape.join(',')}]`,
    };
  }

  let maxAbs = 0;
  let maxRel: number | undefined;
  const fail = walkPairs(observation.value, spec.expected, (o, e) => {
    if (!Number.isFinite(o)) return 'not_finite';
    if (!Number.isFinite(e)) return 'spec_invalid';
    const diff = Math.abs(o - e);
    if (diff > maxAbs) maxAbs = diff;
    if (e !== 0) {
      const r = diff / Math.abs(e);
      if (maxRel === undefined || r > maxRel) maxRel = r;
    }
    const absTol = tol.absolute;
    const relTol = tol.relative;
    if (absTol !== undefined && relTol !== undefined) {
      return diff <= absTol + relTol * Math.abs(e) ? null : 'value_mismatch';
    }
    if (absTol !== undefined) {
      return diff <= absTol ? null : 'value_mismatch';
    }
    // relTol !== undefined
    return diff <= (relTol as number) * Math.abs(e) ? null : 'value_mismatch';
  });

  const base: NumericCheckResult = {
    id: spec.id,
    passed: fail === null,
    maxAbsError: maxAbs,
    observedShape,
  };
  if (maxRel !== undefined) base.maxRelError = maxRel;
  if (observation.unit !== undefined) base.observedUnit = observation.unit;
  if (fail !== null) {
    base.reason = fail;
    base.message =
      fail === 'value_mismatch'
        ? `value outside tolerance (max |Δ|=${maxAbs}${maxRel !== undefined ? `, max rel=${maxRel}` : ''})`
        : fail === 'not_finite'
          ? `observed value contains a non-finite entry`
          : fail;
  }
  return base;
}

/**
 * Run a batch of numeric checks against an observation map. The map keys are
 * the spec ids — typically authored as `metrics.<id>` in the runner artifact.
 */
export function checkNumericBatch(
  observations: Readonly<Record<string, NumericObservation>>,
  specs: ReadonlyArray<NumericCheckSpec>,
): NumericCheckBatch {
  const results = specs.map((spec) => checkNumeric(observations[spec.id], spec));
  const passedCount = results.filter((r) => r.passed).length;
  return {
    passed: results.length > 0 && passedCount === results.length,
    results,
    passRatio: results.length === 0 ? 0 : passedCount / results.length,
  };
}

/**
 * Convenience adapter: build a `NumericObservation` map from a plain
 * `metrics: Record<string, number>` block and an optional unit map. This is
 * what `RunArtifacts.metrics` plus an authored unit hint typically produce.
 */
export function metricsToObservations(
  metrics: Readonly<Record<string, number>> | undefined,
  units?: Readonly<Record<string, string>>,
): Record<string, NumericObservation> {
  const out: Record<string, NumericObservation> = {};
  if (metrics === undefined) return out;
  for (const [k, v] of Object.entries(metrics)) {
    const obs: NumericObservation = { value: v };
    const u = units?.[k];
    if (u !== undefined) obs.unit = u;
    out[k] = obs;
  }
  return out;
}
