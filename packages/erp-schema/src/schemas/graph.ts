import { z } from 'zod';

export const stageTypeEnum = z.enum([
  'framing',
  'math',
  'decision',
  'implementation',
  'experiment',
  'analysis',
  'writing',
  'review',
  'reflection',
]);

export const graphChoiceSchema = z.object({
  id: z.string().min(1),
  branch: z.string().min(1),
});

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  type: stageTypeEnum,
  title: z.string().min(1),
  stage: z.string().min(1),
  artifact_refs: z.array(z.string()).optional(),
  choices: z.array(graphChoiceSchema).optional(),
  unlocks: z.array(z.string()).optional(),
  unlocks_by_choice: z.record(z.string(), z.array(z.string())).optional(),
});

export const graphSchema = z.object({
  nodes: z.array(graphNodeSchema).min(1),
});
