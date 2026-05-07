import { z } from 'zod';

export const hintEntrySchema = z.object({
  level: z.number().int().nonnegative(),
  body_md: z.string().min(1),
});

export const hintSchema = z.object({
  stage_id: z.string().min(1),
  hints: z.array(hintEntrySchema).min(1),
});
