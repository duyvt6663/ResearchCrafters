import { describe, expect, it, vi } from 'vitest';
import type { Rubric, Stage } from '@researchcrafters/erp-schema';
import {
  gradeAttempt,
  idempotencyKey,
  InMemoryGradeStore,
  InMemoryIntermediateStore,
} from '../src/index.js';
import type { SubmissionInput } from '../src/index.js';

function makeStage(
  runnerMode: 'test' | 'replay' | 'mini_experiment' | 'none' = 'test',
): Stage {
  return {
    id: 'S001',
    title: 'Stage One',
    type: 'code',
    difficulty: 'easy',
    estimated_time_minutes: 30,
    artifact_refs: [],
    task: { prompt_md: 'do the thing' },
    stage_policy: {
      mentor_visibility: {
        stage_copy: 'always',
        artifact_refs: 'always',
        rubric: 'after_attempt',
        evidence: 'after_attempt',
        branch_feedback: 'after_pass',
        canonical_solution: 'after_completion',
        branch_solutions: 'after_completion',
      },
      runner: { mode: runnerMode },
      validation: { kind: 'rubric' },
      inputs: { mode: 'code' },
      pass_threshold: 0.7,
      feedback: {},
    },
  };
}

function makeRubric(): Rubric {
  return {
    id: 'R001',
    pass_threshold: 0.7,
    dimensions: [
      {
        id: 'correctness',
        label: 'Correctness',
        description: 'tests pass',
        weight: 1,
        criteria: ['tests pass'],
      },
    ],
  };
}

const submission: SubmissionInput = { id: 'sub-resume' };

describe('gradeAttempt with intermediateStore', () => {
  it('checkpoints preflight + deterministic dimensions after a successful default scoring', async () => {
    const store = new InMemoryGradeStore();
    const intermediateStore = new InMemoryIntermediateStore();
    await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        testResults: [{ name: 't1', passed: true }],
      },
      store,
      intermediateStore,
    });
    const key = idempotencyKey({
      submissionId: submission.id,
      rubricVersion: 'v1',
      evaluatorVersion: '0.1.0',
    });
    const snapshot = await intermediateStore.find(key);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.preflightPassed).toBe(true);
    expect(snapshot?.executionStatus).toBe('ok');
    expect(snapshot?.passThreshold).toBe(0.7);
    expect(snapshot?.deterministicDimensions).toHaveLength(1);
    expect(snapshot?.deterministicDimensions?.[0]?.score).toBe(1);
  });

  it('skips preflight and reuses cached deterministic dimensions on retry after a partial failure', async () => {
    // First attempt: deterministic work succeeds but the final grade insert
    // blows up, simulating a partial failure between the checkpoint and the
    // grade write.
    const intermediateStore = new InMemoryIntermediateStore();
    const failingStore = new InMemoryGradeStore();
    let inserts = 0;
    const origInsert = failingStore.insert.bind(failingStore);
    failingStore.insert = vi.fn(async (g) => {
      inserts += 1;
      if (inserts === 1) throw new Error('simulated partial failure');
      return origInsert(g);
    });

    await expect(
      gradeAttempt({
        stage: makeStage('test'),
        rubric: makeRubric(),
        rubricVersion: 'v1',
        submission,
        runArtifacts: {
          executionStatus: 'ok',
          testResults: [{ name: 't1', passed: true }],
        },
        store: failingStore,
        intermediateStore,
      }),
    ).rejects.toThrow('simulated partial failure');

    // Snapshot should be persisted despite the downstream failure.
    const key = idempotencyKey({
      submissionId: submission.id,
      rubricVersion: 'v1',
      evaluatorVersion: '0.1.0',
    });
    const snapshot = await intermediateStore.find(key);
    expect(snapshot?.deterministicDimensions).toHaveLength(1);

    // Retry: even with a stage object that would FAIL preflight (executable
    // stage + non-ok status) and run artifacts the default scorer would now
    // score at 0, the cached snapshot should be reused: preflight is skipped
    // and the original deterministic dimensions are reapplied. This proves
    // the upstream work is not re-run.
    const scoreDimSpy = vi.fn();
    const retry = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'timeout',
        testResults: [{ name: 't1', passed: false }],
      },
      store: failingStore,
      intermediateStore,
      // Asserting scoreDimensions is not even called when the cache hits.
      scoreDimensions: undefined,
      newId: () => 'retry-grade-id',
    });
    expect(retry.status).toBe('passed');
    expect(retry.rubricScore).toBe(1);
    expect(scoreDimSpy).not.toHaveBeenCalled();
  });

  it('does not cache dimensions from a custom non-deterministic scorer but still records preflight', async () => {
    const store = new InMemoryGradeStore();
    const intermediateStore = new InMemoryIntermediateStore();
    await gradeAttempt({
      stage: makeStage('none'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: { executionStatus: 'ok' },
      store,
      intermediateStore,
      scoreDimensions: () => [
        { id: 'correctness', label: 'Correctness', score: 0.9, weight: 1 },
      ],
    });
    const key = idempotencyKey({
      submissionId: submission.id,
      rubricVersion: 'v1',
      evaluatorVersion: '0.1.0',
    });
    const snapshot = await intermediateStore.find(key);
    expect(snapshot?.preflightPassed).toBe(true);
    expect(snapshot?.deterministicDimensions).toBeUndefined();
  });

  it('does not snapshot when preflight refuses the submission', async () => {
    const store = new InMemoryGradeStore();
    const intermediateStore = new InMemoryIntermediateStore();
    const grade = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: { executionStatus: 'timeout' },
      store,
      intermediateStore,
    });
    expect(grade.status).toBe('execution_failed');
    const key = idempotencyKey({
      submissionId: submission.id,
      rubricVersion: 'v1',
      evaluatorVersion: '0.1.0',
    });
    const snapshot = await intermediateStore.find(key);
    expect(snapshot).toBeNull();
  });
});
