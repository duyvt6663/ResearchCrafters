import { z } from 'zod';
import { difficultyEnum } from './package.js';
import { stageTypeEnum } from './graph.js';

/**
 * Inline fixture-hash declaration shape. Mirrors `runnerFixtureSchema` in
 * `./runner.ts` but lives here to avoid a stage <-> runner import cycle
 * (runner.ts imports `runnerModeEnum` from this file). Both types are
 * structurally identical: `{ path, sha256 }`.
 */
const stageRunnerFixtureSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().min(1),
});

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

export const inputFieldKindEnum = z.enum([
  'string',
  'number',
  'select',
  'textarea',
  // Authored ResNet vocabulary — kept as legitimate field kinds because they
  // express richer semantics than the four-element starter set:
  //   - `single_choice`: radio-style discrete option list (UI: radio group).
  //   - `free_text`: long-form textarea with no structural validation.
  //   - `structured`: opaque nested schema (the `schema` key on the field
  //     describes the inner shape; UI builds a typed form from it).
  'single_choice',
  'free_text',
  'structured',
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

/**
 * Structured authoring shape for `inputs.fields[]`. Authors use this when the
 * stage's UI needs typed form fields rather than a single free-text or code
 * blob. The web app (`apps/web`) renders these against `inputs.mode` when both
 * are set, falling back to a single textarea when only `mode` is present.
 */
export const stageInputFieldSchema = z
  .object({
    // Authors may identify the field via `id` (preferred) or `name` (legacy
    // ResNet content). Both are accepted; downstream consumers use whichever
    // is present.
    id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    kind: inputFieldKindEnum,
    // `options` is used by `select` / `single_choice` to enumerate choices.
    options: z.array(z.string()).optional(),
    // `structured` fields carry a nested authoring schema — opaque to the
    // validator (the rendering layer interprets it).
    schema: z.unknown().optional(),
  })
  .passthrough()
  .refine((v) => v.id !== undefined || v.name !== undefined, {
    message: "stage input field requires either 'id' or 'name'",
  });

/**
 * Per-attack schema for `mentor_leak_tests`.
 *
 * - `prompt` is the adversarial user-prompt the harness sends to the mentor.
 * - `attack_id` is an optional stable id authors can use to override one of
 *   the default battery's attacks (deduplication happens by id in the
 *   leak-test runner — see `packages/content-sdk/src/validator/leak-tests.ts`).
 * - `must_not_contain` is the per-attack assertion list. When present, the
 *   harness fails this specific attack if the model output contains ANY of
 *   the listed strings, regardless of whether they appear in the stage-wide
 *   `mentor_redaction_targets`. This gives authors per-prompt precision —
 *   "if I ask THIS, the response must not include X" — separate from the
 *   blanket package/stage redaction lists.
 */
export const mentorLeakTestSchema = z.object({
  prompt: z.string().min(1),
  attack_id: z.string().min(1).optional(),
  must_not_contain: z.array(z.string().min(1)).optional(),
});

export const stagePolicySchema = z.object({
  mentor_visibility: mentorVisibilitySchema,
  runner: z.object({
    mode: runnerModeEnum,
    config: z.string().optional(),
    /**
     * Inline fixture-hash declaration. Optional alternative to declaring the
     * fixture list at the workspace `runner.yaml` level. When both are
     * present, the workspace runner.yaml entry is the source of truth for
     * sandbox hashing; the inline list is advisory authoring metadata.
     */
    fixtures: z.array(stageRunnerFixtureSchema).optional(),
  }),
  validation: z.object({
    kind: validationKindEnum,
    rubric: z.string().optional(),
    /**
     * Optional path (repo-relative) to the test file binding this stage. Used
     * by `kind: 'test'` and `kind: 'hybrid'` stages so the validator can
     * cross-link the stage to a real `workspace/tests/...` file. The runner
     * still gets its actual command from `workspace/runner.yaml`; this field
     * is the authoring-side declaration of the binding.
     */
    test_path: z.string().min(1).optional(),
  }),
  inputs: z.object({
    mode: inputModeEnum,
    /**
     * Structured-input authoring. When present, the web UI renders a typed
     * form using these field descriptors instead of a single textarea.
     */
    fields: z.array(stageInputFieldSchema).optional(),
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
  mentor_leak_tests: z.array(mentorLeakTestSchema).optional(),
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
      /**
       * Optional reference into the curriculum graph (`graph.yaml` node id).
       * Authors use this to bind a stage YAML to its narrative node — the
       * graph-side `nodes[].stage` ref already provides the authoritative
       * binding, so this field is advisory but kept first-class so it does
       * not silently disappear at parse.
       */
      node_id: z.string().min(1).optional(),
      /**
       * Optional source-citation list at the stage level. PRD §7 only
       * defines `source_refs` on branches; on stages it is a custom authoring
       * extension some packages use to point at the paper sections that
       * motivate this stage. Kept optional + non-empty-strings.
       */
      source_refs: z.array(z.string().min(1)).optional(),
      /**
       * Optional evidence-citation list at the stage level. Mirrors the
       * branch field — used by stages whose task asks the learner to engage
       * with a specific evidence artifact (training curve, table, etc.).
       */
      evidence_refs: z.array(z.string().min(1)).optional(),
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
