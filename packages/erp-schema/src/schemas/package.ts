import { z } from 'zod';

const semverRegex =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export const statusEnum = z.enum(['alpha', 'beta', 'live', 'archived']);

/**
 * Stage-level difficulty vocabulary (kept stable; matches PRD §6 stage example
 * `very_easy | easy | medium | hard`). The original `difficultyEnum` export is
 * retained pointing at this enum to keep the cross-package contract surface
 * unchanged for downstream consumers (`@researchcrafters/content-sdk`,
 * `@researchcrafters/evaluator-sdk`, `apps/web`).
 */
export const difficultyEnum = z.enum(['very_easy', 'easy', 'medium', 'hard']);

/**
 * Package-level difficulty vocabulary. PRD §4 spells the catalog axis as
 * `beginner | intermediate | advanced | expert` ("difficulty: advanced" in the
 * worked example). We keep this split deliberately:
 *
 * - Package difficulty answers: how hard is the *whole journey* for a learner
 *   browsing the catalog? Marketing / catalog axis.
 * - Stage difficulty answers: how hard is *this stage* relative to its
 *   neighbours within the package? Authoring / pacing axis.
 *
 * They cannot share a vocabulary without losing one of those axes — a
 * `beginner` package can still contain a `hard` stage near the end, and a
 * `very_easy` first stage in an `expert` package is not a category error.
 *
 * `packageDifficultyEnum` is additive: existing fixtures that wrote
 * `difficulty: easy` at the package level continue to parse because we accept
 * both the package-level vocabulary AND the stage-level vocabulary on
 * `package.difficulty`.
 */
export const packageDifficultyEnum = z.enum([
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);

/**
 * Backwards-compatible package-difficulty acceptor. Accepts either vocabulary
 * so existing fixtures (which used the stage vocabulary at the package level)
 * keep parsing while authored content can adopt the PRD vocabulary.
 */
export const packageDifficultyAccept = z.union([
  packageDifficultyEnum,
  difficultyEnum,
]);

export const paperSchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string()),
  year: z.number().int(),
  arxiv: z.string(),
});

export const releaseSchema = z.object({
  free_stage_ids: z.array(z.string()),
  requires_gpu: z.boolean(),
});

export const reviewSchema = z.object({
  expert_reviewer: z.string().optional(),
  last_reviewed_at: z.string().optional(),
});

/**
 * Package-level safety block (PRD §4 / §6 last paragraph).
 *
 * `redaction_targets` is the package-wide canonical-leak deny-list — strings
 * that the mentor LLM must never reproduce verbatim. The leak-test harness
 * unions these with each stage's `stage_policy.mentor_redaction_targets` to
 * build the per-stage hunt list. Authors keep package-wide invariants here
 * (canonical phrasings tied to the paper's central insight: e.g. ResNet's
 * "F(x) + x" / "shortcut connection") and stage-specific scrub items at the
 * stage level.
 *
 * `banned_patterns` is an optional escape hatch for raw regex strings that
 * authors can use when literal-string redaction targets are too narrow.
 *
 * The block is OPTIONAL on the package type: not every content package needs
 * it (a structural-only template may have no LLM-mentor surface at all). When
 * the block IS present, `redaction_targets` must contain at least one entry —
 * an empty list is a strong signal of authoring drift and should fail at
 * parse rather than be silently coerced into a no-op.
 *
 * PRD §4 promises this should eventually be MANDATORY for any package whose
 * stages use LLM mentor feedback or LLM grading. We do not enforce mandatory
 * at the package root yet — the existing content corpus has not finished
 * authoring `safety` blocks, and a hard requirement would fail-closed every
 * existing package. The validator (pedagogy layer) is where that escalation
 * lands once content has caught up.
 */
/**
 * Per-package authored refusal copy.
 *
 * Per backlog/05-mentor-safety.md (`Stage Policy` › "Author refusal copy per
 * package; do not let the model generate refusals."), refusal strings shown to
 * the learner are authored content — never produced by the LLM. This block
 * lets a package override the platform-default copy resolved by
 * `getAuthoredRefusal` in `@researchcrafters/ai`.
 *
 * Every scope is optional: any scope the package omits falls back to the
 * platform default. Each scope override carries a short `title`, a learner-
 * facing `body`, and an optional `hint` that points the learner at a useful
 * next action.
 */
const refusalCopySchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  hint: z.string().min(1).optional(),
});

export const mentorRefusalScopeEnum = z.enum([
  'solution_request',
  'out_of_context',
  'rate_limit',
  'budget_cap',
  'policy_block',
  'flagged_output',
]);

export const mentorRefusalsSchema = z.record(
  mentorRefusalScopeEnum,
  refusalCopySchema,
);

export const safetySchema = z.object({
  redaction_targets: z.array(z.string().min(1)).min(1, {
    message: 'safety.redaction_targets must contain at least one entry when the block is present',
  }),
  banned_patterns: z.array(z.string()).optional(),
  /**
   * Optional per-package authored refusal copy. See `mentorRefusalsSchema`.
   * The keys are mentor refusal scopes (`solution_request`, `out_of_context`,
   * `rate_limit`, `budget_cap`, `policy_block`, `flagged_output`); any scope
   * the package omits falls back to platform defaults. Refusal strings MUST
   * be authored — the LLM is never allowed to write them.
   */
  mentor_refusals: mentorRefusalsSchema.optional(),
});

/**
 * Fixture refresh cadence (PRD §4, backlog 02-erp-content-package §"Cached
 * Evidence and Fixture Acquisition").
 *
 * Replay-mode stages depend on precomputed fixture files stored under
 * `workspace/fixtures/`. Those fixtures decay: PyTorch/CUDA upgrades shift
 * numerics, hardware changes alter ordering, paper revisions invalidate the
 * underlying experiment. The package therefore commits to a refresh policy,
 * recorded directly in package metadata so it can be audited without grepping
 * READMEs.
 *
 * Two surface forms are accepted:
 *
 *  1. Legacy bare string (`fixture_refresh_cadence: "annual"`) — kept so
 *     existing YAMLs and the `invalid-package` test fixture do not need to
 *     be migrated at the same time. Normalised to `{ interval }` after parse.
 *  2. Structured object — interval plus optional `triggers`, `owner`,
 *     `last_refreshed_at`, `next_refresh_due`. This is the form authors should
 *     adopt going forward.
 *
 * Triggers are non-interval conditions that force a refresh outside the
 * regular schedule (e.g. a CUDA/PyTorch upgrade or a recorded-hash drift).
 */
export const fixtureRefreshIntervalEnum = z.enum([
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'on_trigger',
]);

export const fixtureRefreshTriggerEnum = z.enum([
  'library_upgrade',
  'hardware_change',
  'paper_revision',
  'hash_drift',
  'manual_audit',
]);

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'expected ISO date (YYYY-MM-DD)' });

export const fixtureRefreshCadenceObjectSchema = z.object({
  interval: fixtureRefreshIntervalEnum,
  triggers: z.array(fixtureRefreshTriggerEnum).optional(),
  owner: z.string().min(1).optional(),
  last_refreshed_at: isoDateString.optional(),
  next_refresh_due: isoDateString.optional(),
});

export const fixtureRefreshCadenceSchema = z
  .union([fixtureRefreshIntervalEnum, fixtureRefreshCadenceObjectSchema])
  .transform((value) =>
    typeof value === 'string' ? { interval: value } : value,
  );

export const packageSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  paper: paperSchema,
  status: statusEnum,
  // Accept both vocabularies for backwards compatibility; new content should
  // use the PRD vocabulary `beginner | intermediate | advanced | expert`.
  difficulty: packageDifficultyAccept,
  estimated_time_minutes: z.number().int().nonnegative(),
  skills: z.array(z.string()),
  prerequisites: z.array(z.string()),
  release: releaseSchema,
  review: reviewSchema,
  /**
   * Optional safety block — see `safetySchema` for the contract.
   *
   * Kept optional for backwards compatibility with the current content corpus.
   * Once authors finish migrating, this is expected to become mandatory for
   * packages whose stages enable LLM mentor feedback or LLM grading.
   */
  safety: safetySchema.optional(),
  /**
   * Optional fixture refresh cadence — see `fixtureRefreshCadenceSchema` for
   * the contract. Optional because not every package ships replay-mode
   * stages; the validator (pedagogy layer) is where mandatory escalation
   * lands once authoring catches up.
   */
  fixture_refresh_cadence: fixtureRefreshCadenceSchema.optional(),
  version: z.string().regex(semverRegex, { message: 'version must be a valid semver string' }),
});
