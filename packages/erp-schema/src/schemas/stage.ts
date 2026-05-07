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

export const stageSchema = z
  .object({
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
  })
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
  });
