import { z } from 'zod';

export const rubricCriterionSchema = z.string().min(1);

export const rubricDimensionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  weight: z.number().min(0),
  criteria: z.array(rubricCriterionSchema).min(1),
});

export const rubricSchema = z.object({
  id: z.string().min(1),
  dimensions: z.array(rubricDimensionSchema).min(1),
  pass_threshold: z.number().min(0).max(1),
  hidden_correct: z.string().optional(),
});
