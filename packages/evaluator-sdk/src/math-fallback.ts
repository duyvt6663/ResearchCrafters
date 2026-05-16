/**
 * Rubric fallback for math submissions that escape the deterministic
 * primitives.
 *
 * `checkNumeric`, the shape table, and the per-step derivation grader cover
 * math stages where the learner submits a value, a tensor shape, or a chain
 * of values keyed by step id. Some math stages cannot reduce to that:
 *
 *   - **Proof outlines** — multi-step arguments where each step needs a
 *     justification (lemma reference, prior step, citation).
 *   - **Counterexamples** — a concrete witness instance plus the property
 *     it satisfies and the claim it falsifies; only the caller knows
 *     whether the witness actually breaks the claim.
 *   - **Conceptual explanations** — natural-language explanations that
 *     must touch authored concepts and stay within a length window.
 *
 * For these, the deterministic primitives can still do structural pre-
 * checks (steps are present, witness is exhibited, concepts are mentioned,
 * length is sane). What they cannot do is judge whether the *content* of
 * the argument is correct — that judgment is delegated to a rubric grader
 * (typically the LLM grader, but any function that produces dimension
 * scores can plug in).
 *
 * This module returns:
 *
 *   1. A structural status — `ok`, `failed`, `spec_invalid` — that says
 *      whether the submission is grader-ready. A structural failure
 *      short-circuits with zero score and a deterministic message, so the
 *      LLM never sees malformed submissions.
 *   2. A `rubricScaffold` — a small typed object that names the default
 *      dimensions (e.g. `clarity`, `validity`, `coverage`) the qualitative
 *      grader should fill in. Authors can override the scaffold via the
 *      spec; the defaults are tuned per kind.
 *   3. A `dimensions` array of deterministic dimension scores produced by
 *      the structural checks (e.g. "justifications_present"). These are
 *      surfaced separately from the rubric scaffold so the caller can
 *      combine them with grader-produced dimensions before aggregating.
 *
 * The qualitative grader itself lives outside this module. Plug it in via
 * `gradeAttempt`'s `scoreDimensions` callback or call `llmGrade` directly
 * with the scaffold's dimensions. This module is intentionally synchronous
 * and side-effect-free so it can be tested without a gateway.
 */

import type { RubricDimensionScore } from './types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MathFallbackKind =
  | 'proof_outline'
  | 'counterexample'
  | 'conceptual_explanation';

export type MathFallbackStatus = 'ok' | 'failed' | 'spec_invalid';

export interface RubricScaffoldDimension {
  id: string;
  label: string;
  /** Authored weight in `[0, 1]`. The scaffold's weights sum to 1. */
  weight: number;
  description: string;
}

export interface RubricScaffold {
  kind: MathFallbackKind;
  dimensions: ReadonlyArray<RubricScaffoldDimension>;
}

export interface MathFallbackResult {
  id: string;
  kind: MathFallbackKind;
  status: MathFallbackStatus;
  /**
   * Deterministic dimension scores produced by structural checks (e.g.
   * "justifications_present"). May be empty when no structural checks ran.
   */
  dimensions: ReadonlyArray<RubricDimensionScore>;
  /** Scaffold the qualitative grader should fill in. */
  rubricScaffold: RubricScaffold;
  /** Human-readable reason when status is not `ok`. */
  message?: string;
}

// ---------------------------------------------------------------------------
// Proof outline
// ---------------------------------------------------------------------------

export interface ProofOutlineStep {
  /** The claim made at this step (free text). */
  claim: string;
  /**
   * Justification text — a reference to a lemma, a prior step id, a
   * citation, or any short string explaining *why* this step holds. Empty
   * or whitespace-only justifications count as missing.
   */
  justification?: string;
}

export interface ProofOutlineSubmission {
  steps: ReadonlyArray<ProofOutlineStep>;
}

export interface ProofOutlineSpec {
  id: string;
  kind: 'proof_outline';
  /** Minimum number of steps the outline must contain. Default 1. */
  minSteps?: number;
  /**
   * When true (default), every step must carry a non-empty justification.
   * Authors set this to false for early-stage outlines that grade the
   * *structure* only.
   */
  requireJustifications?: boolean;
  /** Optional override of the default rubric scaffold. */
  rubricScaffold?: RubricScaffold;
}

// ---------------------------------------------------------------------------
// Counterexample
// ---------------------------------------------------------------------------

export interface CounterexampleSubmission {
  /** The concrete witness instance the learner exhibits. */
  instance?: string;
  /** Properties the learner asserts the witness satisfies (the premise). */
  satisfies?: ReadonlyArray<string>;
  /** Claim(s) the learner asserts the witness falsifies. */
  violates?: ReadonlyArray<string>;
}

export interface CounterexampleSpec {
  id: string;
  kind: 'counterexample';
  /**
   * Properties the witness must violate to count as a counterexample. The
   * submission's `violates` list must include every entry here (case- and
   * whitespace-insensitive).
   */
  mustViolate: ReadonlyArray<string>;
  /**
   * Optional caller-supplied verifier: returns true iff the witness
   * actually breaks the claim. When provided and it returns false, the
   * structural status is `failed` regardless of the textual match — the
   * learner exhibited something that does not falsify the claim.
   */
  verifier?: (instance: string) => boolean;
  rubricScaffold?: RubricScaffold;
}

// ---------------------------------------------------------------------------
// Conceptual explanation
// ---------------------------------------------------------------------------

export interface ConceptualExplanationSubmission {
  text?: string;
}

export interface ConceptualExplanationSpec {
  id: string;
  kind: 'conceptual_explanation';
  /**
   * Required concept tags. Each entry must appear (case-insensitive
   * substring match) at least once in the submitted text.
   */
  requiredConcepts: ReadonlyArray<string>;
  /** Inclusive lower bound on word count. Default 0 (no lower bound). */
  minWords?: number;
  /** Inclusive upper bound on word count. Default Infinity. */
  maxWords?: number;
  rubricScaffold?: RubricScaffold;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export type MathFallbackSpec =
  | ProofOutlineSpec
  | CounterexampleSpec
  | ConceptualExplanationSpec;

export type MathFallbackSubmission =
  | { kind: 'proof_outline'; submission: ProofOutlineSubmission }
  | { kind: 'counterexample'; submission: CounterexampleSubmission }
  | {
      kind: 'conceptual_explanation';
      submission: ConceptualExplanationSubmission;
    };

export function checkMathFallback(
  submission: MathFallbackSubmission | undefined,
  spec: MathFallbackSpec,
): MathFallbackResult {
  if (submission === undefined) {
    return buildFailure(spec, 'no submission provided');
  }
  if (submission.kind !== spec.kind) {
    return buildSpecInvalid(
      spec,
      `submission kind '${submission.kind}' does not match spec kind '${spec.kind}'`,
    );
  }
  switch (spec.kind) {
    case 'proof_outline':
      return checkProofOutline(
        (submission as { submission: ProofOutlineSubmission }).submission,
        spec,
      );
    case 'counterexample':
      return checkCounterexample(
        (submission as { submission: CounterexampleSubmission }).submission,
        spec,
      );
    case 'conceptual_explanation':
      return checkConceptualExplanation(
        (submission as { submission: ConceptualExplanationSubmission })
          .submission,
        spec,
      );
  }
}

// ---------------------------------------------------------------------------
// Per-kind checkers
// ---------------------------------------------------------------------------

const DEFAULT_PROOF_OUTLINE_SCAFFOLD: RubricScaffold = {
  kind: 'proof_outline',
  dimensions: [
    {
      id: 'logical_validity',
      label: 'Logical validity',
      weight: 0.45,
      description:
        'Each step follows from prior steps, cited lemmas, or stated axioms with no skipped inferences.',
    },
    {
      id: 'completeness',
      label: 'Completeness',
      weight: 0.35,
      description:
        'The outline covers the claim end-to-end; no case, hypothesis, or boundary is left unaddressed.',
    },
    {
      id: 'clarity',
      label: 'Clarity',
      weight: 0.2,
      description:
        'Each step is stated clearly enough that a peer could reconstruct the argument without guessing.',
    },
  ],
};

export function checkProofOutline(
  submission: ProofOutlineSubmission,
  spec: ProofOutlineSpec,
): MathFallbackResult {
  const scaffold = spec.rubricScaffold ?? DEFAULT_PROOF_OUTLINE_SCAFFOLD;
  const minSteps = spec.minSteps ?? 1;
  if (!Number.isFinite(minSteps) || minSteps < 0) {
    return buildSpecInvalid(spec, `minSteps must be a non-negative finite number`);
  }
  const requireJust = spec.requireJustifications ?? true;
  const steps = submission.steps ?? [];

  if (steps.length < minSteps) {
    return {
      id: spec.id,
      kind: 'proof_outline',
      status: 'failed',
      dimensions: [
        deterministicDim(
          'step_count',
          'Step count',
          0,
          0.5,
          `submission has ${steps.length} step(s); spec requires at least ${minSteps}`,
        ),
      ],
      rubricScaffold: scaffold,
      message: `proof outline has ${steps.length} step(s); ${minSteps} required`,
    };
  }

  if (!requireJust) {
    return {
      id: spec.id,
      kind: 'proof_outline',
      status: 'ok',
      dimensions: [
        deterministicDim('step_count', 'Step count', 1, 0.5),
      ],
      rubricScaffold: scaffold,
    };
  }

  const missing = steps
    .map((step, idx) => ({ idx, justification: step.justification }))
    .filter((s) => !nonEmpty(s.justification));
  const presentRatio =
    steps.length === 0 ? 0 : (steps.length - missing.length) / steps.length;

  const justificationsDim = deterministicDim(
    'justifications_present',
    'Justifications present',
    presentRatio,
    0.5,
    missing.length === 0
      ? undefined
      : `missing justifications on step(s): ${missing.map((m) => m.idx + 1).join(', ')}`,
  );
  const stepCountDim = deterministicDim(
    'step_count',
    'Step count',
    1,
    0.5,
  );

  if (missing.length > 0) {
    return {
      id: spec.id,
      kind: 'proof_outline',
      status: 'failed',
      dimensions: [stepCountDim, justificationsDim],
      rubricScaffold: scaffold,
      message: `${missing.length} step(s) missing a justification`,
    };
  }

  return {
    id: spec.id,
    kind: 'proof_outline',
    status: 'ok',
    dimensions: [stepCountDim, justificationsDim],
    rubricScaffold: scaffold,
  };
}

const DEFAULT_COUNTEREXAMPLE_SCAFFOLD: RubricScaffold = {
  kind: 'counterexample',
  dimensions: [
    {
      id: 'witness_validity',
      label: 'Witness validity',
      weight: 0.6,
      description:
        'The exhibited instance actually satisfies the premise and falsifies the claim it is offered against.',
    },
    {
      id: 'explanation_quality',
      label: 'Explanation quality',
      weight: 0.4,
      description:
        'The reasoning makes the falsification mechanism explicit rather than asserting it.',
    },
  ],
};

export function checkCounterexample(
  submission: CounterexampleSubmission,
  spec: CounterexampleSpec,
): MathFallbackResult {
  const scaffold = spec.rubricScaffold ?? DEFAULT_COUNTEREXAMPLE_SCAFFOLD;
  if (spec.mustViolate.length === 0) {
    return buildSpecInvalid(
      spec,
      'mustViolate is empty; counterexample spec needs at least one claim to falsify',
    );
  }

  if (!nonEmpty(submission.instance)) {
    return {
      id: spec.id,
      kind: 'counterexample',
      status: 'failed',
      dimensions: [
        deterministicDim(
          'witness_present',
          'Witness present',
          0,
          0.5,
          'no witness instance exhibited',
        ),
      ],
      rubricScaffold: scaffold,
      message: 'no counterexample instance exhibited',
    };
  }

  const submittedViolates = (submission.violates ?? []).map(normalizeClause);
  const required = spec.mustViolate.map(normalizeClause);
  const missingClaims = required.filter(
    (req) => !submittedViolates.includes(req),
  );

  const witnessDim = deterministicDim('witness_present', 'Witness present', 1, 0.3);
  const claimsRatio =
    required.length === 0
      ? 1
      : (required.length - missingClaims.length) / required.length;
  const claimsDim = deterministicDim(
    'claims_targeted',
    'Targeted claims',
    claimsRatio,
    0.3,
    missingClaims.length === 0
      ? undefined
      : `submission does not assert violation of: ${missingClaims.join(', ')}`,
  );

  if (missingClaims.length > 0) {
    return {
      id: spec.id,
      kind: 'counterexample',
      status: 'failed',
      dimensions: [witnessDim, claimsDim],
      rubricScaffold: scaffold,
      message: `missing required violated claim(s): ${missingClaims.join(', ')}`,
    };
  }

  if (spec.verifier !== undefined) {
    let verified: boolean;
    try {
      verified = spec.verifier(submission.instance!);
    } catch (err) {
      return {
        id: spec.id,
        kind: 'counterexample',
        status: 'spec_invalid',
        dimensions: [witnessDim, claimsDim],
        rubricScaffold: scaffold,
        message: `verifier threw: ${(err as Error).message}`,
      };
    }
    const verifierDim = deterministicDim(
      'verifier',
      'Witness verifier',
      verified ? 1 : 0,
      0.4,
      verified ? undefined : 'verifier rejected the exhibited witness',
    );
    if (!verified) {
      return {
        id: spec.id,
        kind: 'counterexample',
        status: 'failed',
        dimensions: [witnessDim, claimsDim, verifierDim],
        rubricScaffold: scaffold,
        message: 'verifier rejected the exhibited witness',
      };
    }
    return {
      id: spec.id,
      kind: 'counterexample',
      status: 'ok',
      dimensions: [witnessDim, claimsDim, verifierDim],
      rubricScaffold: scaffold,
    };
  }

  return {
    id: spec.id,
    kind: 'counterexample',
    status: 'ok',
    dimensions: [witnessDim, claimsDim],
    rubricScaffold: scaffold,
  };
}

const DEFAULT_CONCEPTUAL_SCAFFOLD: RubricScaffold = {
  kind: 'conceptual_explanation',
  dimensions: [
    {
      id: 'concept_accuracy',
      label: 'Concept accuracy',
      weight: 0.45,
      description:
        'The required concepts are stated correctly, not just name-dropped.',
    },
    {
      id: 'coverage',
      label: 'Coverage',
      weight: 0.3,
      description:
        'The explanation addresses each required concept rather than circling one.',
    },
    {
      id: 'clarity',
      label: 'Clarity',
      weight: 0.25,
      description:
        'The explanation is structured and readable to a peer learner.',
    },
  ],
};

export function checkConceptualExplanation(
  submission: ConceptualExplanationSubmission,
  spec: ConceptualExplanationSpec,
): MathFallbackResult {
  const scaffold = spec.rubricScaffold ?? DEFAULT_CONCEPTUAL_SCAFFOLD;
  const minWords = spec.minWords ?? 0;
  const maxWords = spec.maxWords ?? Number.POSITIVE_INFINITY;
  if (
    !Number.isFinite(minWords) ||
    minWords < 0 ||
    (Number.isFinite(maxWords) && maxWords < minWords)
  ) {
    return buildSpecInvalid(
      spec,
      `invalid word bounds: min=${minWords} max=${String(maxWords)}`,
    );
  }
  if (spec.requiredConcepts.length === 0) {
    return buildSpecInvalid(
      spec,
      'requiredConcepts is empty; conceptual-explanation spec needs at least one concept tag',
    );
  }

  const text = submission.text ?? '';
  const wordCount = countWords(text);
  const haystack = text.toLowerCase();
  const missing = spec.requiredConcepts.filter(
    (c) => !haystack.includes(c.toLowerCase()),
  );
  const coverageRatio =
    spec.requiredConcepts.length === 0
      ? 1
      : (spec.requiredConcepts.length - missing.length) /
        spec.requiredConcepts.length;

  const conceptCoverageDim = deterministicDim(
    'concept_coverage',
    'Required concept coverage',
    coverageRatio,
    0.5,
    missing.length === 0
      ? undefined
      : `missing concepts: ${missing.join(', ')}`,
  );

  if (wordCount < minWords) {
    return {
      id: spec.id,
      kind: 'conceptual_explanation',
      status: 'failed',
      dimensions: [
        conceptCoverageDim,
        deterministicDim(
          'word_count',
          'Word count',
          0,
          0.5,
          `submission has ${wordCount} word(s); minimum is ${minWords}`,
        ),
      ],
      rubricScaffold: scaffold,
      message: `submission is too short: ${wordCount} words (min ${minWords})`,
    };
  }
  if (Number.isFinite(maxWords) && wordCount > maxWords) {
    return {
      id: spec.id,
      kind: 'conceptual_explanation',
      status: 'failed',
      dimensions: [
        conceptCoverageDim,
        deterministicDim(
          'word_count',
          'Word count',
          0,
          0.5,
          `submission has ${wordCount} word(s); maximum is ${maxWords}`,
        ),
      ],
      rubricScaffold: scaffold,
      message: `submission exceeds the length cap: ${wordCount} words (max ${maxWords})`,
    };
  }

  const wordCountDim = deterministicDim('word_count', 'Word count', 1, 0.5);

  if (missing.length > 0) {
    return {
      id: spec.id,
      kind: 'conceptual_explanation',
      status: 'failed',
      dimensions: [conceptCoverageDim, wordCountDim],
      rubricScaffold: scaffold,
      message: `missing required concept(s): ${missing.join(', ')}`,
    };
  }

  return {
    id: spec.id,
    kind: 'conceptual_explanation',
    status: 'ok',
    dimensions: [conceptCoverageDim, wordCountDim],
    rubricScaffold: scaffold,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFailure(
  spec: MathFallbackSpec,
  message: string,
): MathFallbackResult {
  return {
    id: spec.id,
    kind: spec.kind,
    status: 'failed',
    dimensions: [],
    rubricScaffold: defaultScaffoldFor(spec),
    message,
  };
}

function buildSpecInvalid(
  spec: MathFallbackSpec,
  message: string,
): MathFallbackResult {
  return {
    id: spec.id,
    kind: spec.kind,
    status: 'spec_invalid',
    dimensions: [],
    rubricScaffold: defaultScaffoldFor(spec),
    message,
  };
}

function defaultScaffoldFor(spec: MathFallbackSpec): RubricScaffold {
  if (spec.rubricScaffold) return spec.rubricScaffold;
  switch (spec.kind) {
    case 'proof_outline':
      return DEFAULT_PROOF_OUTLINE_SCAFFOLD;
    case 'counterexample':
      return DEFAULT_COUNTEREXAMPLE_SCAFFOLD;
    case 'conceptual_explanation':
      return DEFAULT_CONCEPTUAL_SCAFFOLD;
  }
}

function deterministicDim(
  id: string,
  label: string,
  score: number,
  weight: number,
  notes?: string,
): RubricDimensionScore {
  const dim: RubricDimensionScore = { id, label, score, weight };
  if (notes !== undefined) dim.notes = notes;
  return dim;
}

function nonEmpty(s: string | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function normalizeClause(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function countWords(s: string): number {
  const trimmed = s.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
