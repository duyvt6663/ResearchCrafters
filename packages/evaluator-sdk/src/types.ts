/**
 * Public grade types. The web app, runner, and mentor packages all import
 * `Grade` and `ExecutionStatus` from this module.
 */

export type GradeStatus =
  | 'passed'
  | 'partial'
  | 'failed'
  | 'pending'
  | 'execution_failed';

export type ExecutionStatus =
  | 'ok'
  | 'timeout'
  | 'oom'
  | 'crash'
  | 'exit_nonzero';

export interface RubricDimensionScore {
  /** Dimension id from `rubric.yaml` (e.g. `implementation_quality`). */
  id: string;
  label: string;
  /** Normalized 0..1 score. */
  score: number;
  /** Rubric weight at evaluator runtime. */
  weight: number;
  /** Optional bullet evidence references for the score. */
  evidenceRefs?: string[];
  /** Optional human-readable explanation. */
  notes?: string;
}

export interface GradeOverrideEntry {
  reviewerId: string;
  note: string;
  /** ISO timestamp. */
  appliedAt: string;
  /** Patch applied to the grade body — small, typed shape. */
  override: {
    status?: GradeStatus;
    rubricScore?: number;
    feedback?: string;
  };
}

export interface Grade {
  id: string;
  submissionId: string;
  stageId: string;
  rubricVersion: string;
  evaluatorVersion: string;
  status: GradeStatus;
  /** Aggregate normalized score 0..1. */
  rubricScore: number;
  passThreshold: number;
  dimensions: ReadonlyArray<RubricDimensionScore>;
  /** Bullet feedback shown to the learner. */
  feedback: string;
  /** When LLM grading was used, this records model metadata. */
  model?: {
    provider: string;
    modelId: string;
    promptTokens: number;
    completionTokens: number;
    redactionTriggered: boolean;
  };
  /** Reviewer overrides — appended only, never mutated. */
  history: ReadonlyArray<GradeOverrideEntry>;
  createdAt: string;
}

export interface RunArtifacts {
  executionStatus: ExecutionStatus;
  /** Test results parsed by `parsers/runner-artifacts.ts`. */
  testResults?: ReadonlyArray<{ name: string; passed: boolean; message?: string }>;
  metrics?: Readonly<Record<string, number>>;
  /** Free-form artifact pointers — keys come from the runner contract. */
  artifactPointers?: Readonly<Record<string, string>>;
  /** Free-text outputs the LLM grader is allowed to read (post-redaction). */
  textOutputs?: Readonly<Record<string, string>>;
}

export interface SubmissionInput {
  id: string;
  /** Free-form learner answer for writing/analysis stages. */
  answerText?: string;
  /** Required evidence references for evidence-citing rubrics. */
  evidenceRefs?: ReadonlyArray<string>;
}
