import { describe, expect, it } from 'vitest';
import type { Rubric, Stage } from '@researchcrafters/erp-schema';
import {
  EvaluatorRefusal,
  gradeAttempt,
  InMemoryGradeStore,
  applyOverride,
} from '../src/index.js';
import type { RunArtifacts, SubmissionInput } from '../src/index.js';

function makeStage(runnerMode: 'test' | 'replay' | 'mini_experiment' | 'none' = 'test'): Stage {
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

const submission: SubmissionInput = { id: 'sub1' };

describe('gradeAttempt', () => {
  it('refuses to grade executable stages without execution_status=ok', async () => {
    const store = new InMemoryGradeStore();
    const artifacts: RunArtifacts = { executionStatus: 'timeout' };
    const grade = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: artifacts,
      store,
    });
    expect(grade.status).toBe('execution_failed');
    expect(grade.rubricScore).toBe(0);
    expect(grade.feedback).toContain('timed out');
  });

  it('grades non-executable stages even without runner output', async () => {
    const store = new InMemoryGradeStore();
    const grade = await gradeAttempt({
      stage: makeStage('none'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: { executionStatus: 'ok' },
      store,
    });
    // No tests => default scorer scores 0 => failed
    expect(grade.status).toBe('failed');
  });

  it('passes when all tests pass and threshold met', async () => {
    const store = new InMemoryGradeStore();
    const grade = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        testResults: [
          { name: 't1', passed: true },
          { name: 't2', passed: true },
        ],
      },
      store,
    });
    expect(grade.status).toBe('passed');
    expect(grade.rubricScore).toBe(1);
  });

  it('reports partial credit between threshold and 0', async () => {
    const store = new InMemoryGradeStore();
    const grade = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        testResults: [
          { name: 't1', passed: true },
          { name: 't2', passed: false },
        ],
      },
      store,
    });
    expect(grade.status).toBe('partial');
    expect(grade.rubricScore).toBeGreaterThan(0);
    expect(grade.rubricScore).toBeLessThan(0.7);
  });

  it('is idempotent: same submission/rubricVersion/evaluatorVersion returns existing grade', async () => {
    const store = new InMemoryGradeStore();
    let idCounter = 0;
    const first = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        testResults: [{ name: 't1', passed: true }],
      },
      store,
      newId: () => `id-${++idCounter}`,
    });
    const second = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        // Even with different artifacts, idempotency should return the first.
        testResults: [{ name: 't1', passed: false }],
      },
      store,
      newId: () => `id-${++idCounter}`,
    });
    expect(second.id).toBe(first.id);
    expect(second.status).toBe(first.status);
  });

  it('refuses when rubric requires evidence but submission omits it', async () => {
    const store = new InMemoryGradeStore();
    const rubric: Rubric = { ...makeRubric(), hidden_correct: 'something' };
    await expect(
      gradeAttempt({
        stage: makeStage('test'),
        rubric,
        rubricVersion: 'v1',
        submission: { id: 'sub-no-evidence' },
        runArtifacts: { executionStatus: 'ok' },
        store,
      }),
    ).rejects.toBeInstanceOf(EvaluatorRefusal);
  });

  it('refuses with citation_policy_violation in strict mode when a claim is uncited', async () => {
    const store = new InMemoryGradeStore();
    await expect(
      gradeAttempt({
        stage: makeStage('none'),
        rubric: makeRubric(),
        rubricVersion: 'v1',
        submission,
        runArtifacts: { executionStatus: 'ok' },
        store,
        citationPolicy: {
          policy: { allowedEvidenceRefs: ['E1'] },
          claims: [
            { id: 'c1', text: 'cited', citedRefs: ['E1'] },
            { id: 'c2', text: 'uncited claim' },
          ],
          mode: 'strict',
        },
      }),
    ).rejects.toMatchObject({
      name: 'EvaluatorRefusal',
      reason: 'citation_policy_violation',
    });
  });

  it('refuses strict mode when a claim cites a ref outside the allow-list', async () => {
    const store = new InMemoryGradeStore();
    await expect(
      gradeAttempt({
        stage: makeStage('none'),
        rubric: makeRubric(),
        rubricVersion: 'v1',
        submission,
        runArtifacts: { executionStatus: 'ok' },
        store,
        citationPolicy: {
          policy: { allowedEvidenceRefs: ['E1'] },
          claims: [
            { id: 'c1', text: 'forged ref', citedRefs: ['paper://outside.pdf'] },
          ],
          mode: 'strict',
        },
      }),
    ).rejects.toBeInstanceOf(EvaluatorRefusal);
  });

  it('grades in flag mode and appends the citation summary to feedback', async () => {
    const store = new InMemoryGradeStore();
    const grade = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        testResults: [{ name: 't1', passed: true }],
      },
      store,
      citationPolicy: {
        policy: { allowedEvidenceRefs: ['E1'] },
        claims: [
          { id: 'c1', text: 'cited', citedRefs: ['E1'] },
          { id: 'c2', text: 'uncited' },
        ],
        mode: 'flag',
      },
    });
    expect(grade.status).toBe('passed');
    expect(grade.feedback).toContain('Citation policy issues');
    expect(grade.feedback).toContain('no_citation');
  });

  it('honors a placeholder-allowed stage in strict mode without refusing', async () => {
    const store = new InMemoryGradeStore();
    const grade = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        testResults: [{ name: 't1', passed: true }],
      },
      store,
      citationPolicy: {
        policy: {
          allowedEvidenceRefs: ['E1'],
          placeholderTokens: ['<TBD>'],
          placeholderAllowed: true,
        },
        claims: [
          { id: 'c1', text: 'draft', citedRefs: ['<TBD>'] },
          { id: 'c2', text: 'cited', citedRefs: ['E1'] },
        ],
        mode: 'strict',
      },
    });
    expect(grade.status).toBe('passed');
    expect(grade.feedback).toContain('placeholder');
  });

  it('omits writingEvaluator metadata for non-writing grades', async () => {
    const store = new InMemoryGradeStore();
    const grade = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        testResults: [{ name: 't1', passed: true }],
      },
      store,
    });
    expect(grade.writingEvaluator).toBeUndefined();
  });

  it('emits writingEvaluator metadata when a citation policy is enforced', async () => {
    const store = new InMemoryGradeStore();
    const grade = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v3-writing',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        testResults: [{ name: 't1', passed: true }],
      },
      store,
      citationPolicy: {
        policy: {
          allowedEvidenceRefs: ['E1', 'E2'],
          placeholderTokens: ['<TBD>'],
          placeholderAllowed: true,
        },
        claims: [
          { id: 'c1', text: 'cited', citedRefs: ['E1'] },
          { id: 'c2', text: 'placeholder', citedRefs: ['<TBD>'] },
        ],
        mode: 'flag',
      },
    });
    expect(grade.writingEvaluator).toBeDefined();
    expect(grade.writingEvaluator?.rubricVersion).toBe('v3-writing');
    expect(grade.writingEvaluator?.citationPolicy).toMatchObject({
      mode: 'flag',
      verdict: 'passed',
      allowedEvidenceRefs: ['E1', 'E2'],
      placeholderTokens: ['<TBD>'],
      placeholderAllowed: true,
      claimsTotal: 2,
      claimsPassed: 2,
      claimsFailed: 0,
    });
    expect(grade.writingEvaluator?.citationPolicy?.claimsFlagged).toBeGreaterThan(0);
  });

  it('emits writingEvaluator.redaction with targets even when redaction did not fire', async () => {
    const store = new InMemoryGradeStore();
    const grade = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        testResults: [{ name: 't1', passed: true }],
      },
      store,
      redaction: {
        triggered: false,
        targets: ['secret-canonical-phrase'],
      },
    });
    expect(grade.writingEvaluator?.redaction).toEqual({
      triggered: false,
      targets: ['secret-canonical-phrase'],
      matchedTargets: [],
    });
    expect(grade.writingEvaluator?.citationPolicy).toBeUndefined();
  });

  it('emits writingEvaluator.redaction with matched targets when redaction fires', async () => {
    const store = new InMemoryGradeStore();
    const grade = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        testResults: [{ name: 't1', passed: true }],
      },
      store,
      citationPolicy: {
        policy: { allowedEvidenceRefs: ['E1'] },
        claims: [{ id: 'c1', text: 'cited', citedRefs: ['E1'] }],
        mode: 'flag',
      },
      redaction: {
        triggered: true,
        targets: ['canonical-token-A', 'canonical-token-B'],
        matchedTargets: ['canonical-token-A'],
      },
    });
    expect(grade.writingEvaluator?.redaction?.triggered).toBe(true);
    expect(grade.writingEvaluator?.redaction?.matchedTargets).toEqual([
      'canonical-token-A',
    ]);
    expect(grade.writingEvaluator?.citationPolicy?.claimsTotal).toBe(1);
  });

  it('appends overrides without overwriting prior history', async () => {
    const store = new InMemoryGradeStore();
    const grade = await gradeAttempt({
      stage: makeStage('test'),
      rubric: makeRubric(),
      rubricVersion: 'v1',
      submission,
      runArtifacts: {
        executionStatus: 'ok',
        testResults: [{ name: 't1', passed: true }],
      },
      store,
    });
    const updated = await applyOverride({
      gradeId: grade.id,
      reviewerId: 'reviewer-1',
      note: 'manual pass after appeal',
      override: { status: 'passed', rubricScore: 1 },
      store,
    });
    expect(updated.history).toHaveLength(1);
    expect(updated.history[0]?.reviewerId).toBe('reviewer-1');
    const updated2 = await applyOverride({
      gradeId: grade.id,
      reviewerId: 'reviewer-2',
      note: 'further adjustment',
      override: { feedback: 'updated note' },
      store,
    });
    expect(updated2.history).toHaveLength(2);
    expect(updated2.history.map((h) => h.reviewerId)).toEqual(['reviewer-1', 'reviewer-2']);
  });
});
