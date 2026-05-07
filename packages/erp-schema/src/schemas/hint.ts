import { z } from 'zod';

export const hintEntrySchema = z.object({
  level: z.number().int().nonnegative(),
  body_md: z.string().min(1),
});

/**
 * Hint YAML decision (see `content/packages/SCHEMA_NOTES.md`):
 *
 * Two authored shapes exist:
 *
 * 1. Internal canonical: `hints: [{ level: 1, body_md: "..." }, ...]`.
 * 2. PRD-style author-friendly (ResNet, erp-basic):
 *    `levels: [{ level: 1, title: "...", body_md: "..." }, ...]`.
 *
 * Schema accepts both. When `levels` is supplied and `hints` is not, the
 * preprocessor maps `levels` → `hints` (drops `title`; the title is purely
 * authoring metadata for the visible web UI but is not part of the
 * mentor-context surface). When both are present, the canonical `hints` form
 * wins.
 */
function normalizeAuthoredHint(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return input;
  }
  const obj = input as Record<string, unknown>;
  if (Array.isArray(obj.hints) && obj.hints.length > 0) {
    return obj; // canonical shape wins
  }
  if (Array.isArray(obj.levels)) {
    const next: Record<string, unknown> = { ...obj };
    next.hints = (obj.levels as unknown[]).map((lv) => {
      if (typeof lv !== 'object' || lv === null) return lv;
      const lvObj = lv as Record<string, unknown>;
      return {
        level: lvObj.level,
        body_md: lvObj.body_md,
      };
    });
    delete next.levels;
    return next;
  }
  return obj;
}

export const hintSchema = z.preprocess(
  normalizeAuthoredHint,
  z.object({
    stage_id: z.string().min(1),
    hints: z.array(hintEntrySchema).min(1),
  }),
);
