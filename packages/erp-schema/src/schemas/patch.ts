import { z } from 'zod';

/**
 * Patch overlay contract — backlog/06-data-access-analytics.md (Version and
 * Patch Policy): "Allow only cosmetic overlays for patches."
 *
 * `PackageVersionPatch.overlays` (DB column, `Json`) accumulates against a
 * frozen `PackageVersion`. Patches must NOT change anything that affects
 * learner experience semantics — graph topology, stage policy, rubric
 * dimensions/thresholds, runner config, branch definitions, or canonical
 * solutions. Anything in those categories requires a new package version
 * (backlog/06 line 70).
 *
 * The schemas below are intentionally strict (`.strict()` on every object) so
 * unknown keys are rejected at parse time. That keeps drift out of the patch
 * surface: a typo or an attempt to slip in a structural change fails loudly
 * rather than silently overlaying a no-op key the runtime then ignores.
 *
 * The vocabulary is deliberately narrow:
 *
 *  - Package-level cosmetic overlays: catalog copy and display tags only.
 *    `title`, `description`, `skills`, `estimated_time_minutes`. These map
 *    to the marketing/catalog surface and never feed grading, runners, or
 *    policy decisions.
 *  - Stage-level cosmetic overlays: in-stage copy only. `title`,
 *    `description`, `narrative`. These render verbatim to the learner and
 *    do not influence pass/fail evaluation, mentor visibility, or branch
 *    routing.
 *
 * Authors who need anything beyond this — even renaming a branch label, even
 * relaxing a pass threshold by 0.05 — must bump the package version so
 * enrollment pinning and graded-state semantics stay coherent.
 */

export const patchPackageOverlaySchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    skills: z.array(z.string().min(1)).optional(),
    estimated_time_minutes: z.number().int().nonnegative().optional(),
  })
  .strict();

export const patchStageOverlaySchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    narrative: z.string().min(1).optional(),
  })
  .strict();

/**
 * Top-level patch overlay payload. Both top-level keys are optional so a
 * patch can target package-level copy, per-stage copy, or both.
 *
 * `stages` is keyed by YAML stage id (e.g. `"S001"`). Empty objects are
 * permitted at both layers so an author can stage an overlay scaffold during
 * authoring without tripping validation; runtime application is a no-op for
 * empty overlays.
 */
export const patchOverlaySchema = z
  .object({
    package: patchPackageOverlaySchema.optional(),
    stages: z.record(z.string().min(1), patchStageOverlaySchema).optional(),
  })
  .strict();

export type PatchOverlay = z.infer<typeof patchOverlaySchema>;
export type PatchPackageOverlay = z.infer<typeof patchPackageOverlaySchema>;
export type PatchStageOverlay = z.infer<typeof patchStageOverlaySchema>;

export interface PatchOverlayValidation {
  valid: boolean;
  errors: string[];
  data?: PatchOverlay;
}

/**
 * Validate a candidate patch overlay payload (e.g. the JSON about to be
 * written into `PackageVersionPatch.overlays`). Returns a structured result
 * instead of throwing so callers can surface every offending field at once.
 *
 * Error strings include the dotted JSON path so a CLI or API surface can
 * point authors directly at the disallowed key — important because the most
 * common failure mode is an author trying to overlay a structural field
 * (e.g. `stages.S001.pass_threshold`) and the error needs to say so.
 */
export function validatePatchOverlay(input: unknown): PatchOverlayValidation {
  const result = patchOverlaySchema.safeParse(input);
  if (result.success) {
    return { valid: true, errors: [], data: result.data };
  }
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  });
  return { valid: false, errors };
}
