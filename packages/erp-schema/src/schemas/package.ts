import { z } from 'zod';

const semverRegex =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export const statusEnum = z.enum(['alpha', 'beta', 'live', 'archived']);
export const difficultyEnum = z.enum(['very_easy', 'easy', 'medium', 'hard']);

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
  difficulty: difficultyEnum,
  estimated_time_minutes: z.number().int().nonnegative(),
  skills: z.array(z.string()),
  prerequisites: z.array(z.string()),
  release: releaseSchema,
  review: reviewSchema,
  version: z.string().regex(semverRegex, { message: 'version must be a valid semver string' }),
});
