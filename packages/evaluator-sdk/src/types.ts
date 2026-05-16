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

/**
 * Provenance metadata for academic-writing stages. Emitted on the grade so
 * downstream consumers (UI, audit log, telemetry) can render which evidence
 * the stage allowed, which citation-policy mode was in effect, and whether a
 * redaction pass was wired up — without re-reading the stage policy.
 *
 * The block is only attached when the caller supplied `citationPolicy` or
 * `redaction` to `gradeAttempt`; non-writing stages omit it entirely so the
 * payload shape stays the same as before.
 */
export interface WritingEvaluatorMetadata {
  /** Rubric version captured at grade time. Mirrors `Grade.rubricVersion`. */
  rubricVersion: string;
  /** Citation-policy snapshot, populated when a policy was enforced. */
  citationPolicy?: {
    /** Mode under which the policy ran. */
    mode: 'strict' | 'flag';
    /** Verdict from `enforceCitationPolicy` (always `passed` for emitted grades). */
    verdict: 'passed' | 'failed';
    /** Allowed evidence refs the stage permitted. */
    allowedEvidenceRefs: ReadonlyArray<string>;
    /** Placeholder tokens, if the stage opted in. */
    placeholderTokens?: ReadonlyArray<string>;
    /** Whether placeholder tokens were honored as satisfying citations. */
    placeholderAllowed?: boolean;
    /** Total claims checked. */
    claimsTotal: number;
    /** Claims that satisfied the policy. */
    claimsPassed: number;
    /** Claims that failed (no citation, disallowed ref, disallowed placeholder, invalid). */
    claimsFailed: number;
    /** Claims surfaced for rubric attention (failing or placeholder-flagged). */
    claimsFlagged: number;
  };
  /** Redaction snapshot for LLM-grader output, when supplied. */
  redaction?: {
    /** Whether the redactor matched at least one target. */
    triggered: boolean;
    /** Targets that were configured for redaction. */
    targets: ReadonlyArray<string>;
    /** Targets that actually matched in the LLM output. */
    matchedTargets: ReadonlyArray<string>;
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
  /**
   * Writing-evaluator provenance: allowed evidence refs, citation policy,
   * and redaction status. Present only for stages that exercised the writing
   * evaluator path.
   */
  writingEvaluator?: WritingEvaluatorMetadata;
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
