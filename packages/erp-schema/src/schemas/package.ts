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
  version: z.string().regex(semverRegex, { message: 'version must be a valid semver string' }),
});
