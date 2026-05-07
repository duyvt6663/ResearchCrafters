import { describe, expect, it, beforeEach } from 'vitest';
import {
  runSubmissionRun,
  type SubmissionRunJob,
  type SubmissionRunPrisma,
  type RunnerExecutor,
  type RunnerArtifacts,
  type GraderFn,
  type GradeRow,
} from '../src/jobs/submission-run.js';

// -----------------------------------------------------------------------------
// Fake Prisma — captures every mutation so the asserts can read state back.
// -----------------------------------------------------------------------------

interface FakeRun {
  id: string;
  status: string;
  runnerMode: string;
  metricsJson: unknown;
  startedAt: Date | null;
  finishedAt: Date | null;
  logObjectKey: string | null;
  submissionId: string;
}

interface FakeSubmission {
  id: string;
  stageAttemptId: string;
  bundleObjectKey: string;
  bundleSha: string;
  stageAttempt: {
    id: string;
    stageRef: string;
    enrollment: { packageVersionId: string };
  };
}

interface FakeStage {
  id: string;
  stageId: string;
  runnerMode: string;
  rubricRef: string | null;
  passThreshold: number | null;
  stagePolicy: unknown;
}

interface FakeStageAttempt {
  id: string;
  executionStatus: string | null;
  gradeId: string | null;
  passed: boolean;
  score: number | null;
}

interface FakeWorld {
  prisma: SubmissionRunPrisma;
  state: {
    runs: Map<string, FakeRun>;
    submissions: Map<string, FakeSubmission>;
    stages: FakeStage[];
    stageAttempts: Map<string, FakeStageAttempt>;
    runUpdates: Array<{ id: string; data: Record<string, unknown> }>;
    stageAttemptUpdates: Array<{ id: string; data: Record<string, unknown> }>;
  };
}

function makeWorld(opts: {
  run: FakeRun;
  submission: FakeSubmission;
  stages?: FakeStage[];
  stageAttempt?: FakeStageAttempt;
}): FakeWorld {
  const runs = new Map<string, FakeRun>([[opts.run.id, { ...opts.run }]]);
  const submissions = new Map<string, FakeSubmission>([
    [opts.submission.id, { ...opts.submission }],
  ]);
  const stages: FakeStage[] = opts.stages ?? [];
  const stageAttempts = new Map<string, FakeStageAttempt>([
    [
      opts.submission.stageAttempt.id,
      opts.stageAttempt ?? {
        id: opts.submission.stageAttempt.id,
        executionStatus: null,
        gradeId: null,
        passed: false,
        score: null,
      },
    ],
  ]);
  const runUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const stageAttemptUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];

  const prisma: SubmissionRunPrisma = {
    run: {
      async findUnique({ where }) {
        const row = runs.get(where.id);
        if (!row) return null;
        return {
          id: row.id,
          status: row.status,
          runnerMode: row.runnerMode,
          metricsJson: row.metricsJson,
          submissionId: row.submissionId,
        };
      },
      async update({ where, data }) {
        const row = runs.get(where.id);
        if (!row) throw new Error(`run not found: ${where.id}`);
        runUpdates.push({ id: where.id, data: { ...data } });
        Object.assign(row, data);
        return row;
      },
    },
    submission: {
      async findUnique({ where }) {
        return submissions.get(where.id) ?? null;
      },
    },
    stage: {
      async findFirst({ where }) {
        return (
          stages.find(
            (s) =>
              s.stageId === where.stageId &&
              // packageVersionId is checked by the production query but our
              // tests pin a single package, so it's fine to skip the assertion
              // unless authors add a multi-package test.
              true,
          ) ?? null
        );
      },
    },
    stageAttempt: {
      async update({ where, data }) {
        const row = stageAttempts.get(where.id);
        if (!row) throw new Error(`stageAttempt not found: ${where.id}`);
        stageAttemptUpdates.push({ id: where.id, data: { ...data } });
        Object.assign(row, data);
        return row;
      },
    },
  };

  return {
    prisma,
    state: {
      runs,
      submissions,
      stages,
      stageAttempts,
      runUpdates,
      stageAttemptUpdates,
    },
  };
}

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-05-07T10:00:00.000Z');
const fixedClock = () => FIXED_NOW;

function baseRun(): FakeRun {
  return {
    id: 'run_1',
    status: 'queued',
    runnerMode: 'none',
    metricsJson: null,
    startedAt: null,
    finishedAt: null,
    logObjectKey: null,
    submissionId: 'sub_1',
  };
}

function baseSubmission(stageRef = 'S003'): FakeSubmission {
  return {
    id: 'sub_1',
    stageAttemptId: 'sa_1',
    bundleObjectKey: 'submissions/sub_1/bundle.tar.gz',
    bundleSha: 'a'.repeat(64),
    stageAttempt: {
      id: 'sa_1',
      stageRef,
      enrollment: { packageVersionId: 'pv_1' },
    },
  };
}

function stage(opts: Partial<FakeStage> = {}): FakeStage {
  return {
    id: 'st_1',
    stageId: 'S003',
    runnerMode: 'test',
    rubricRef: 'rubric-analysis',
    passThreshold: 0.6,
    stagePolicy: {},
    ...opts,
  };
}

function job(overrides: Partial<SubmissionRunJob> = {}): SubmissionRunJob {
  return {
    runId: 'run_1',
    submissionId: 'sub_1',
    packageVersionId: 'pv_1',
    stageRef: 'S003',
    runnerMode: 'test',
    ...overrides,
  };
}

const noopLog = (): void => undefined;

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('runSubmissionRun', () => {
  let executorCalls: number;
  let graderCalls: number;
  let lastGraderInput: Parameters<GraderFn>[0] | null;

  beforeEach(() => {
    executorCalls = 0;
    graderCalls = 0;
    lastGraderInput = null;
  });

  function fakeExecutor(artifacts: RunnerArtifacts): RunnerExecutor {
    return async () => {
      executorCalls += 1;
      return artifacts;
    };
  }

  function fakeGrader(grade: GradeRow | null = null): GraderFn {
    return async (input) => {
      graderCalls += 1;
      lastGraderInput = input;
      return grade;
    };
  }

  it('runnerMode=none short-circuits to ok without invoking the runner executor', async () => {
    // `none` mode is reserved for writing/analysis stages; in seeded ResNet
    // those stages don't carry an executable rubric, so we model the same
    // shape here (no rubricRef => grader is naturally skipped).
    const world = makeWorld({
      run: baseRun(),
      submission: baseSubmission('S001'),
      stages: [stage({ stageId: 'S001', runnerMode: 'none', rubricRef: null })],
    });

    const result = await runSubmissionRun(
      job({ runnerMode: 'none', stageRef: 'S001' }),
      world.prisma,
      {
        runnerExecutor: fakeExecutor({
          executionStatus: 'crash',
          logs: [],
        }),
        grader: fakeGrader(),
        now: fixedClock,
        log: noopLog,
      },
    );

    expect(result.executionStatus).toBe('ok');
    expect(result.shortCircuited).toBe(true);
    // The executor must NOT run for `none` mode — the run is short-circuited
    // before any sandbox spin-up.
    expect(executorCalls).toBe(0);
    // No rubric on the stage row => no grader call.
    expect(graderCalls).toBe(0);

    // Run row sequence: queued -> running -> ok.
    const statuses = world.state.runUpdates.map((u) => u.data['status']);
    expect(statuses).toEqual(['running', 'ok']);
    // Final update mirrors the run-status union and stamps finishedAt.
    const final = world.state.runUpdates.at(-1)!;
    expect(final.data['finishedAt']).toBe(FIXED_NOW);
    // StageAttempt mirrors executionStatus.
    expect(world.state.stageAttemptUpdates).toContainEqual(
      expect.objectContaining({
        id: 'sa_1',
        data: expect.objectContaining({ executionStatus: 'ok' }),
      }),
    );
  });

  it('runnerMode=test happy path persists logs/metrics and produces a Grade', async () => {
    const world = makeWorld({
      run: baseRun(),
      submission: baseSubmission('S003'),
      stages: [stage()],
    });

    const grade: GradeRow = {
      id: 'grade_1',
      stageAttemptId: 'sa_1',
      submissionId: 'sub_1',
      rubricVersion: 'rubric-analysis',
      evaluatorVersion: '0.1.0',
      passed: true,
      score: 0.85,
      dimensions: [],
      evidenceRefs: [],
      modelMeta: null,
    };

    const result = await runSubmissionRun(job(), world.prisma, {
      runnerExecutor: fakeExecutor({
        executionStatus: 'ok',
        logs: [
          { ts: FIXED_NOW.toISOString(), severity: 'info', text: 'pytest passed' },
        ],
        metrics: { duration_seconds: 12 },
        testResults: [{ name: 'test_residual_block', passed: true }],
        durationMs: 12000,
      }),
      grader: fakeGrader(grade),
      now: fixedClock,
      log: noopLog,
    });

    expect(result.executionStatus).toBe('ok');
    expect(result.gradeId).toBe('grade_1');
    expect(executorCalls).toBe(1);
    expect(graderCalls).toBe(1);
    expect(lastGraderInput?.rubricVersion).toBe('rubric-analysis');
    expect(lastGraderInput?.passThreshold).toBe(0.6);

    // metricsJson body carries logs + metrics + testResults.
    const finalRun = world.state.runs.get('run_1')!;
    const metrics = finalRun.metricsJson as Record<string, unknown>;
    expect(metrics['logs']).toEqual([
      { ts: FIXED_NOW.toISOString(), severity: 'info', text: 'pytest passed' },
    ]);
    expect(metrics['metrics']).toEqual({ duration_seconds: 12 });
    expect(metrics['testResults']).toEqual([
      { name: 'test_residual_block', passed: true },
    ]);
    expect(metrics['durationMs']).toBe(12000);

    // StageAttempt is updated twice: executionStatus mirror, then grade.
    const attemptDataKeys = world.state.stageAttemptUpdates.map((u) =>
      Object.keys(u.data),
    );
    expect(attemptDataKeys).toEqual([
      ['executionStatus'],
      ['gradeId', 'passed', 'score'],
    ]);
    const sa = world.state.stageAttempts.get('sa_1')!;
    expect(sa.gradeId).toBe('grade_1');
    expect(sa.passed).toBe(true);
    expect(sa.score).toBe(0.85);
  });

  it('runnerMode=replay with hash mismatch (executor throws) records crash and skips grading', async () => {
    const world = makeWorld({
      run: baseRun(),
      submission: baseSubmission('S004'),
      stages: [stage({ stageId: 'S004', runnerMode: 'replay' })],
    });

    const throwingExecutor: RunnerExecutor = async () => {
      throw new Error('replay fixture hash mismatch: workspace/fixtures/stage-004/training_log.json');
    };

    const result = await runSubmissionRun(
      job({ runnerMode: 'replay', stageRef: 'S004' }),
      world.prisma,
      {
        runnerExecutor: throwingExecutor,
        grader: fakeGrader(),
        now: fixedClock,
        log: noopLog,
      },
    );

    expect(result.executionStatus).toBe('crash');
    expect(result.gradedSkipped).toBe(true);
    expect(graderCalls).toBe(0);

    const finalRun = world.state.runs.get('run_1')!;
    expect(finalRun.status).toBe('crash');
    expect(finalRun.finishedAt).toEqual(FIXED_NOW);
    const metrics = finalRun.metricsJson as Record<string, unknown>;
    const logs = metrics['logs'] as Array<{ severity: string; text: string }>;
    expect(logs[0]?.severity).toBe('error');
    expect(logs[0]?.text).toContain('replay fixture hash mismatch');

    // StageAttempt only sees the executionStatus mirror — no grade write.
    expect(world.state.stageAttemptUpdates).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ executionStatus: 'crash' }),
      }),
    ]);
  });

  it('executionStatus=timeout does NOT call the evaluator', async () => {
    const world = makeWorld({
      run: baseRun(),
      submission: baseSubmission('S007'),
      stages: [stage({ stageId: 'S007', runnerMode: 'mini_experiment' })],
    });

    const result = await runSubmissionRun(
      job({ runnerMode: 'mini_experiment', stageRef: 'S007' }),
      world.prisma,
      {
        runnerExecutor: fakeExecutor({
          executionStatus: 'timeout',
          logs: [{ ts: FIXED_NOW.toISOString(), severity: 'warn', text: 'wall-clock exceeded' }],
        }),
        grader: fakeGrader({
          // The grader returns a grade but should never be called — the test
          // would observe the call via graderCalls if the gating regressed.
          id: 'grade_should_not_appear',
          stageAttemptId: 'sa_1',
          submissionId: 'sub_1',
          rubricVersion: 'rubric-analysis',
          evaluatorVersion: '0.1.0',
          passed: false,
          score: 0,
          dimensions: [],
          evidenceRefs: [],
          modelMeta: null,
        }),
        now: fixedClock,
        log: noopLog,
      },
    );

    expect(result.executionStatus).toBe('timeout');
    expect(result.gradedSkipped).toBe(true);
    expect(executorCalls).toBe(1);
    expect(graderCalls).toBe(0);

    const finalRun = world.state.runs.get('run_1')!;
    expect(finalRun.status).toBe('timeout');
    expect(finalRun.finishedAt).toEqual(FIXED_NOW);
  });

  it('skips grading when no rubric is mirrored on the Stage row', async () => {
    const world = makeWorld({
      run: baseRun(),
      submission: baseSubmission('S003'),
      stages: [stage({ rubricRef: null })],
    });

    const result = await runSubmissionRun(job(), world.prisma, {
      runnerExecutor: fakeExecutor({
        executionStatus: 'ok',
        logs: [],
      }),
      grader: fakeGrader(),
      now: fixedClock,
      log: noopLog,
    });

    expect(result.executionStatus).toBe('ok');
    expect(result.gradedSkipped).toBe(true);
    expect(graderCalls).toBe(0);
  });

  it('marks the run crashed when the submission has gone missing', async () => {
    // Build a world where the run exists but the submission row was wiped
    // before the worker picked the job up.
    const world = makeWorld({
      run: baseRun(),
      submission: baseSubmission('S003'),
      stages: [stage()],
    });
    world.state.submissions.clear();

    const result = await runSubmissionRun(job(), world.prisma, {
      runnerExecutor: fakeExecutor({
        executionStatus: 'ok',
        logs: [],
      }),
      grader: fakeGrader(),
      now: fixedClock,
      log: noopLog,
    });

    expect(result.executionStatus).toBe('crash');
    const finalRun = world.state.runs.get('run_1')!;
    expect(finalRun.status).toBe('crash');
  });
});
