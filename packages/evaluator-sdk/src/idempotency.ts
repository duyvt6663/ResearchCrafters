import type { Grade } from './types.js';

/**
 * Deterministic key for grade deduplication. Per TODOS/04: deduplicate by
 * `(submission_id, rubric_version, evaluator_version)`.
 */
export function idempotencyKey(args: {
  submissionId: string;
  rubricVersion: string;
  evaluatorVersion: string;
}): string {
  return `${args.submissionId}::${args.rubricVersion}::${args.evaluatorVersion}`;
}

/**
 * Bring-your-own grade store. The web app wires this to Postgres; tests use an
 * in-memory map.
 */
export interface GradeStore {
  /** Look up an existing grade for an idempotency key, if any. */
  findByKey(key: string): Promise<Grade | null>;
  /** Persist a brand-new grade. */
  insert(grade: Grade): Promise<Grade>;
  /** Append an override to the grade history; never overwrites. */
  appendOverride(gradeId: string, entry: Grade['history'][number]): Promise<Grade>;
}

/**
 * Trivial in-memory store, useful for tests and local dev.
 */
export class InMemoryGradeStore implements GradeStore {
  private readonly byKey = new Map<string, Grade>();
  private readonly byId = new Map<string, Grade>();

  async findByKey(key: string): Promise<Grade | null> {
    return this.byKey.get(key) ?? null;
  }

  async insert(grade: Grade): Promise<Grade> {
    const key = idempotencyKey({
      submissionId: grade.submissionId,
      rubricVersion: grade.rubricVersion,
      evaluatorVersion: grade.evaluatorVersion,
    });
    this.byKey.set(key, grade);
    this.byId.set(grade.id, grade);
    return grade;
  }

  async appendOverride(gradeId: string, entry: Grade['history'][number]): Promise<Grade> {
    const existing = this.byId.get(gradeId);
    if (!existing) throw new Error(`grade ${gradeId} not found`);
    const updated: Grade = {
      ...existing,
      history: [...existing.history, entry],
      // Apply override patch to surface fields.
      ...(entry.override.status !== undefined ? { status: entry.override.status } : {}),
      ...(entry.override.rubricScore !== undefined
        ? { rubricScore: entry.override.rubricScore }
        : {}),
      ...(entry.override.feedback !== undefined ? { feedback: entry.override.feedback } : {}),
    };
    this.byId.set(gradeId, updated);
    const key = idempotencyKey({
      submissionId: updated.submissionId,
      rubricVersion: updated.rubricVersion,
      evaluatorVersion: updated.evaluatorVersion,
    });
    this.byKey.set(key, updated);
    return updated;
  }
}
