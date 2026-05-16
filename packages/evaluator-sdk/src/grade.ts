import type { Rubric, Stage } from '@researchcrafters/erp-schema';
import type {
  ExecutionStatus,
  Grade,
  GradeStatus,
  RubricDimensionScore,
  RunArtifacts,
  SubmissionInput,
} from './types.js';
import { idempotencyKey, type GradeStore } from './idempotency.js';
import type { IntermediateStore } from './intermediate.js';

const EVALUATOR_VERSION = '0.1.0';

export interface GradeAttemptInput {
  stage: Stage;
  rubric: Rubric;
  rubricVersion: string;
  submission: SubmissionInput;
  runArtifacts: RunArtifacts;
  store: GradeStore;
  /**
   * Optional store for deterministic intermediate results. When supplied, the
   * evaluator persists a checkpoint after preflight + deterministic dimension
   * scoring; if a later step fails and the caller retries, those upstream
   * checks are skipped and the cached deterministic state is reused.
   */
  intermediateStore?: IntermediateStore;
  /**
   * Optional override of the evaluator version label. Tests can pin it;
   * production reads from package.json or build metadata.
   */
  evaluatorVersion?: string;
  /**
   * Optional dimension scorer. If absent, the default rule scores each
   * dimension by checking whether matching test results passed and whether
   * required evidence refs are present.
   *
   * Custom scorers are assumed to be non-deterministic from the cache's point
   * of view (e.g. they may call an LLM), so their output is never reused from
   * an intermediate snapshot; only the preflight signal is.
   */
  scoreDimensions?: (args: {
    stage: Stage;
    rubric: Rubric;
    submission: SubmissionInput;
    runArtifacts: RunArtifacts;
  }) => ReadonlyArray<RubricDimensionScore>;
  /** ISO timestamp factory; tests inject a fixed clock. */
  now?: () => string;
  /** Generates a unique grade id; tests inject. */
  newId?: () => string;
}

/**
 * Stages with executable validation must report execution_status=ok before we
 * grade them. Determined by the stage's runner mode.
 */
function isExecutableStage(stage: Stage): boolean {
  return stage.stage_policy.runner.mode !== 'none';
}

function aggregateScore(dims: ReadonlyArray<RubricDimensionScore>): number {
  const totalWeight = dims.reduce((acc, d) => acc + d.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = dims.reduce((acc, d) => acc + d.score * d.weight, 0);
  return weighted / totalWeight;
}

function deriveStatus(score: number, threshold: number): GradeStatus {
  if (score >= threshold) return 'passed';
  if (score > 0) return 'partial';
  return 'failed';
}

function defaultDimensionScorer(args: {
  rubric: Rubric;
  runArtifacts: RunArtifacts;
}): ReadonlyArray<RubricDimensionScore> {
  // Default: if there are no test results, score every dimension at 0.
  // If there are test results, score each dimension proportional to passes.
  const tests = args.runArtifacts.testResults ?? [];
  const passRatio = tests.length === 0 ? 0 : tests.filter((t) => t.passed).length / tests.length;
  return args.rubric.dimensions.map((d) => ({
    id: d.id,
    label: d.label,
    score: passRatio,
    weight: d.weight,
  }));
}

export class EvaluatorRefusal extends Error {
  constructor(
    public readonly reason:
      | 'execution_failed'
      | 'evidence_missing'
      | 'rubric_mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'EvaluatorRefusal';
  }
}

/**
 * Grade an attempt. Refuses to grade unless execution_status=ok for executable
 * stages, refuses if required evidence is missing, and reuses any existing
 * grade for the same idempotency key. When an `intermediateStore` is provided,
 * deterministic upstream work (preflight + default dimension scoring) is
 * checkpointed so a partial failure can resume without re-running it.
 */
export async function gradeAttempt(input: GradeAttemptInput): Promise<Grade> {
  const evaluatorVersion = input.evaluatorVersion ?? EVALUATOR_VERSION;
  const now = input.now ?? (() => new Date().toISOString());
  const newId =
    input.newId ??
    (() => globalThis.crypto?.randomUUID?.() ?? `grade-${Math.random().toString(36).slice(2)}`);

  const idKey = idempotencyKey({
    submissionId: input.submission.id,
    rubricVersion: input.rubricVersion,
    evaluatorVersion,
  });

  // Idempotency: reuse existing grade if any.
  const existing = await input.store.findByKey(idKey);
  if (existing) return existing;

  const cached = input.intermediateStore
    ? await input.intermediateStore.find(idKey)
    : null;

  // Preflight: skip if a prior attempt already passed it for this key.
  if (!cached?.preflightPassed) {
    if (
      isExecutableStage(input.stage) &&
      input.runArtifacts.executionStatus !== 'ok'
    ) {
      const failed: Grade = {
        id: newId(),
        submissionId: input.submission.id,
        stageId: input.stage.id,
        rubricVersion: input.rubricVersion,
        evaluatorVersion,
        status: 'execution_failed',
        rubricScore: 0,
        passThreshold:
          input.stage.stage_policy.pass_threshold ?? input.rubric.pass_threshold,
        dimensions: [],
        feedback: refusalFeedback(input.runArtifacts.executionStatus),
        history: [],
        createdAt: now(),
      };
      return input.store.insert(failed);
    }

    if (
      input.rubric.hidden_correct !== undefined &&
      (input.submission.evidenceRefs === undefined ||
        input.submission.evidenceRefs.length === 0)
    ) {
      throw new EvaluatorRefusal(
        'evidence_missing',
        'Required evidence references are missing for this submission.',
      );
    }
  }

  const passThreshold =
    cached?.passThreshold ??
    input.stage.stage_policy.pass_threshold ??
    input.rubric.pass_threshold;

  // Dimensions: reuse cached deterministic dimensions when no custom scorer
  // is supplied; custom scorers are treated as non-deterministic and always
  // re-run.
  let dimensions: ReadonlyArray<RubricDimensionScore>;
  let dimensionsAreDeterministic: boolean;
  if (input.scoreDimensions) {
    dimensions = input.scoreDimensions({
      stage: input.stage,
      rubric: input.rubric,
      submission: input.submission,
      runArtifacts: input.runArtifacts,
    });
    dimensionsAreDeterministic = false;
  } else if (cached?.deterministicDimensions) {
    dimensions = cached.deterministicDimensions;
    dimensionsAreDeterministic = true;
  } else {
    dimensions = defaultDimensionScorer({
      rubric: input.rubric,
      runArtifacts: input.runArtifacts,
    });
    dimensionsAreDeterministic = true;
  }

  // Checkpoint deterministic state. Only re-write when we have strictly more
  // deterministic data than the cached snapshot: preflight alone first,
  // dimensions second.
  if (input.intermediateStore) {
    const cachedHasDims = cached?.deterministicDimensions !== undefined;
    const wantsDimSnapshot = dimensionsAreDeterministic && !cachedHasDims;
    if (!cached?.preflightPassed || wantsDimSnapshot) {
      const carriedDims = dimensionsAreDeterministic
        ? dimensions
        : cached?.deterministicDimensions;
      await input.intermediateStore.save({
        key: idKey,
        executionStatus: input.runArtifacts.executionStatus,
        preflightPassed: true,
        passThreshold,
        ...(carriedDims !== undefined ? { deterministicDimensions: carriedDims } : {}),
        savedAt: now(),
      });
    }
  }

  const rubricScore = aggregateScore(dimensions);
  const status = deriveStatus(rubricScore, passThreshold);

  const grade: Grade = {
    id: newId(),
    submissionId: input.submission.id,
    stageId: input.stage.id,
    rubricVersion: input.rubricVersion,
    evaluatorVersion,
    status,
    rubricScore,
    passThreshold,
    dimensions,
    feedback: buildFeedback(status, dimensions),
    history: [],
    createdAt: now(),
  };

  return input.store.insert(grade);
}

function refusalFeedback(status: ExecutionStatus): string {
  const human: Record<ExecutionStatus, string> = {
    ok: 'No execution failure.',
    timeout: 'Your submission timed out. Try a smaller workload or fix the loop.',
    oom: 'Your submission ran out of memory.',
    crash: 'The sandbox crashed. Please retry; if it persists, file a bug.',
    exit_nonzero: 'Your command exited with a non-zero status. Check the logs.',
  };
  return human[status];
}

function buildFeedback(
  status: GradeStatus,
  dims: ReadonlyArray<RubricDimensionScore>,
): string {
  const lines = dims.map(
    (d) => `- ${d.label}: ${(d.score * 100).toFixed(0)}%`,
  );
  return `Status: ${status}\n${lines.join('\n')}`;
}
