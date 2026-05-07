import { z } from 'zod';

export const branchTypeEnum = z.enum([
  'canonical',
  'failed',
  'suboptimal',
  'ambiguous',
  'extension',
]);

export const supportLevelEnum = z.enum(['explicit', 'inferred', 'expert_reconstructed']);

export const branchSchema = z
  .object({
    id: z.string().min(1),
    type: branchTypeEnum,
    support_level: supportLevelEnum,
    choice: z.string().min(1),
    expected_by_learner: z.string().min(1),
    actual_outcome: z.string().min(1),
    evidence_refs: z.array(z.string()),
    source_refs: z.array(z.string()).optional(),
    lesson: z.string().min(1),
    next_nodes: z.array(z.string()).optional(),
  })
  .superRefine((branch, ctx) => {
    if (branch.support_level === 'explicit') {
      if (!branch.source_refs || branch.source_refs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['source_refs'],
          message: 'source_refs must be non-empty when support_level is "explicit"',
        });
      }
    }
  });
