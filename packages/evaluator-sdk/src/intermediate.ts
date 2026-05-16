import type { ExecutionStatus, RubricDimensionScore } from './types.js';

/**
 * Snapshot of deterministic work the evaluator has already completed for a
 * given idempotency key. Persisted so a partial failure further down the
 * pipeline (e.g. an LLM call, a network write) can resume without re-running
 * upstream preflight checks and deterministic dimension scoring.
 *
 * Keyed identically to grades via `idempotencyKey(submissionId, rubricVersion,
 * evaluatorVersion)` so it ties to a single deterministic attempt.
 */
export interface IntermediateResult {
  /** Same shape as the eventual grade's idempotency key. */
  key: string;
  /** Execution status seen at preflight (recorded for audit/replay). */
  executionStatus: ExecutionStatus;
  /** Preflight passed: stage was either non-executable or executionStatus=ok,
   *  and evidence requirements were satisfied. */
  preflightPassed: boolean;
  /** Pass threshold resolved at preflight. */
  passThreshold: number;
  /** Deterministic dimension scores if they were computed (default scorer).
   *  Omitted when a custom non-deterministic scorer was used. */
  deterministicDimensions?: ReadonlyArray<RubricDimensionScore>;
  /** ISO timestamp the snapshot was written. */
  savedAt: string;
}

/**
 * Bring-your-own intermediate-result store. Production wires this to the same
 * Postgres tenant the grade store uses; tests use the in-memory map below.
 *
 * Implementations should treat writes as last-writer-wins for a given key:
 * the evaluator only writes a snapshot once it has more deterministic state
 * than the prior snapshot.
 */
export interface IntermediateStore {
  find(key: string): Promise<IntermediateResult | null>;
  save(result: IntermediateResult): Promise<IntermediateResult>;
}

export class InMemoryIntermediateStore implements IntermediateStore {
  private readonly byKey = new Map<string, IntermediateResult>();

  async find(key: string): Promise<IntermediateResult | null> {
    return this.byKey.get(key) ?? null;
  }

  async save(result: IntermediateResult): Promise<IntermediateResult> {
    this.byKey.set(result.key, result);
    return result;
  }
}
