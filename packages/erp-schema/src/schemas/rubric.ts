import { z } from 'zod';

export const rubricCriterionSchema = z.string().min(1);

export const rubricDimensionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  weight: z.number().min(0),
  criteria: z.array(rubricCriterionSchema).min(1),
});

/**
 * Rubric YAML decision (see `content/packages/SCHEMA_NOTES.md`):
 *
 * Two authored shapes exist in the wild:
 *
 * 1. Internal canonical (FlashAttention sample fixtures, `apps/web` evaluator
 *    paths): `dimensions: [{ id, label, description, weight, criteria: [...] }]`
 *    with `pass_threshold` in the [0,1] range.
 *
 * 2. PRD-style author-friendly (ResNet, erp-basic): `criteria: [{ id, title,
 *    description, weight, levels: [{ score, description }] }]` with
 *    `pass_threshold` in the [0,100] range and a `total_points` budget.
 *
 * Schema accepts both. Shape #2 is lifted into shape #1 in preprocess: each
 * authored `criteria[]` entry becomes a `dimensions[]` entry, the `levels[]`
 * descriptions become the `criteria` string list, and `pass_threshold` is
 * normalized from `[0,100]` → `[0,1]` when `total_points` is present (or when
 * the value is > 1 and ≤ 100). Existing rubric fixtures continue to parse
 * without modification because the preprocessor short-circuits when
 * `dimensions` is already present.
 */
function normalizeAuthoredRubric(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return input;
  }
  const obj = input as Record<string, unknown>;
  if (Array.isArray(obj.dimensions)) {
    return obj; // canonical shape; do not touch.
  }
  const next: Record<string, unknown> = { ...obj };

  if (Array.isArray(obj.criteria)) {
    next.dimensions = (obj.criteria as unknown[]).map((c) => {
      if (typeof c !== 'object' || c === null) return c;
      const cr = c as Record<string, unknown>;
      const levelDescriptions = Array.isArray(cr.levels)
        ? (cr.levels as unknown[])
            .map((lv) => {
              if (typeof lv !== 'object' || lv === null) return null;
              const lvObj = lv as Record<string, unknown>;
              return typeof lvObj.description === 'string' ? lvObj.description : null;
            })
            .filter((s): s is string => typeof s === 'string' && s.length > 0)
        : [];
      const criteriaStrings = levelDescriptions.length > 0
        ? levelDescriptions
        : typeof cr.description === 'string' && cr.description.length > 0
          ? [cr.description]
          : ['(no level descriptions authored)'];
      return {
        id: cr.id,
        label: typeof cr.title === 'string' ? cr.title : (cr.id ?? 'criterion'),
        description: typeof cr.description === 'string' ? cr.description : '',
        weight: typeof cr.weight === 'number' ? cr.weight : 0,
        criteria: criteriaStrings,
      };
    });
    delete next.criteria;
  }

  // Normalize pass_threshold from [0,100] → [0,1] when authored at point scale.
  const passThreshold = obj.pass_threshold;
  if (typeof passThreshold === 'number') {
    const totalPoints = typeof obj.total_points === 'number' ? obj.total_points : null;
    if (totalPoints !== null && totalPoints > 0 && passThreshold > 1) {
      next.pass_threshold = passThreshold / totalPoints;
    } else if (passThreshold > 1 && passThreshold <= 100) {
      next.pass_threshold = passThreshold / 100;
    }
  }

  return next;
}

export const rubricSchema = z.preprocess(
  normalizeAuthoredRubric,
  z.object({
    id: z.string().min(1),
    dimensions: z.array(rubricDimensionSchema).min(1),
    pass_threshold: z.number().min(0).max(1),
    hidden_correct: z.string().optional(),
  }),
);
