import { z } from 'zod';
import { difficultyEnum } from './package.js';
import { stageTypeEnum } from './graph.js';

export const mentorVisibilityStateEnum = z.enum([
  'always',
  'after_attempt',
  'after_pass',
  'after_completion',
  'never',
]);

export const runnerModeEnum = z.enum(['test', 'replay', 'mini_experiment', 'none']);

export const validationKindEnum = z.enum(['test', 'metric', 'rubric', 'hybrid']);

export const inputModeEnum = z.enum([
  'multiple_choice',
  'free_text',
  'code',
  'experiment',
  'mixed',
]);

export const mentorVisibilitySchema = z.object({
  stage_copy: mentorVisibilityStateEnum,
  artifact_refs: mentorVisibilityStateEnum,
  rubric: mentorVisibilityStateEnum,
  evidence: mentorVisibilityStateEnum,
  branch_feedback: mentorVisibilityStateEnum,
  canonical_solution: mentorVisibilityStateEnum,
  branch_solutions: mentorVisibilityStateEnum,
});

export const stagePolicySchema = z.object({
  mentor_visibility: mentorVisibilitySchema,
  runner: z.object({
    mode: runnerModeEnum,
    config: z.string().optional(),
  }),
  validation: z.object({
    kind: validationKindEnum,
    rubric: z.string().optional(),
  }),
  inputs: z.object({
    mode: inputModeEnum,
  }),
  pass_threshold: z.number().min(0).max(1).optional(),
  hints: z
    .object({
      progressive: z.string().optional(),
    })
    .optional(),
  feedback: z.object({
    canonical_md: z.string().optional(),
    common_misconceptions: z.array(z.string()).optional(),
  }),
  mentor_leak_tests: z
    .array(
      z.object({
        prompt: z.string().min(1),
      }),
    )
    .optional(),
  mentor_redaction_targets: z.array(z.string()).optional(),
});

/**
 * Canonical stage YAML decision (PRD §6 + decision doc in
 * `content/packages/SCHEMA_NOTES.md`):
 *
 * Authors write `validation`, `inputs`, `feedback`, `runner`, `hints`,
 * `pass_threshold`, `mentor_leak_tests`, and `mentor_redaction_targets` at the
 * **top level** of the stage YAML, matching the PRD §6 example. Only the
 * `mentor_visibility` map lives under `stage_policy`. The schema preserves the
 * internal canonical shape — everything ends up under `stage_policy.*` after
 * parse — by lifting top-level fields into `stage_policy` during preprocess.
 *
 * The pre-existing nested form (everything under `stage_policy.*`) still
 * parses without modification, which keeps the test fixtures and any author
 * who already wrote nested YAML on the canonical path. Top-level fields take
 * precedence over nested duplicates if both are supplied for the same key.
 */
const STAGE_POLICY_LIFT_KEYS = [
  'validation',
  'inputs',
  'feedback',
  'runner',
  'hints',
  'pass_threshold',
  'mentor_leak_tests',
  'mentor_redaction_targets',
] as const;

type StagePolicyLiftKey = (typeof STAGE_POLICY_LIFT_KEYS)[number];

function liftStageTopLevelIntoPolicy(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return input;
  }
  const obj = input as Record<string, unknown>;
  const policy =
    obj.stage_policy && typeof obj.stage_policy === 'object' && !Array.isArray(obj.stage_policy)
      ? { ...(obj.stage_policy as Record<string, unknown>) }
      : {};

  let mutated = false;
  const result: Record<string, unknown> = { ...obj };

  for (const key of STAGE_POLICY_LIFT_KEYS) {
    if (key in result) {
      // Top-level form wins over nested duplicate — authoring intent.
      policy[key as StagePolicyLiftKey] = result[key];
      delete result[key];
      mutated = true;
    }
  }

  // Provide a sensible default for `feedback` so PRD-style stages that omit it
  // still parse — the schema requires the object to exist.
  if (policy.feedback === undefined) {
    policy.feedback = {};
    mutated = true;
  }
  // Default runner block: if neither top-level nor nested supplied a runner,
  // default to a mode-`none` stage. Stages declaring code/experiment input
  // modes still trip the refinement below.
  if (policy.runner === undefined) {
    policy.runner = { mode: 'none' };
    mutated = true;
  }

  if (mutated || obj.stage_policy === undefined) {
    result.stage_policy = policy;
  }
  return result;
}

export const stageSchema = z
  .preprocess(
    liftStageTopLevelIntoPolicy,
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      type: stageTypeEnum,
      difficulty: difficultyEnum,
      estimated_time_minutes: z.number().int().nonnegative(),
      artifact_refs: z.array(z.string()),
      task: z.object({
        prompt_md: z.string().min(1),
      }),
      stage_policy: stagePolicySchema,
    }),
  )
  .superRefine((stage, ctx) => {
    const v = stage.stage_policy.mentor_visibility;
    const usesAfterPass = Object.values(v).some((s) => s === 'after_pass');
    if (usesAfterPass && stage.stage_policy.pass_threshold === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stage_policy', 'pass_threshold'],
        message:
          'pass_threshold is required when any mentor_visibility scope uses after_pass',
      });
    }
    // Code / experiment inputs require an executable runner mode.
    const inputMode = stage.stage_policy.inputs.mode;
    if (
      (inputMode === 'code' || inputMode === 'experiment') &&
      stage.stage_policy.runner.mode === 'none'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stage_policy', 'runner', 'mode'],
        message: `runner.mode must not be 'none' when inputs.mode is '${inputMode}'`,
      });
    }
  });
