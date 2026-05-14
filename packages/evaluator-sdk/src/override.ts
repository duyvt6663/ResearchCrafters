import type { Grade, GradeOverrideEntry } from './types.js';
import type { GradeStore } from './idempotency.js';

export interface ApplyOverrideInput {
  gradeId: string;
  reviewerId: string;
  note: string;
  override: GradeOverrideEntry['override'];
  store: GradeStore;
  /** Optional clock for tests. */
  now?: () => string;
}

/**
 * Applies a reviewer override to a grade. Per backlog/04: append to history,
 * never overwrite. The store implementation is responsible for persisting the
 * append; this function constructs the entry and forwards it.
 */
export async function applyOverride(input: ApplyOverrideInput): Promise<Grade> {
  if (!input.reviewerId.trim()) {
    throw new Error('reviewerId is required for grade override');
  }
  if (!input.note.trim()) {
    throw new Error('override note is required for audit trail');
  }
  const entry: GradeOverrideEntry = {
    reviewerId: input.reviewerId,
    note: input.note,
    appliedAt: (input.now ?? (() => new Date().toISOString()))(),
    override: input.override,
  };
  return input.store.appendOverride(input.gradeId, entry);
}
