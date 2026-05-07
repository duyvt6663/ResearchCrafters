import { z } from 'zod';
import { runnerModeEnum } from './stage.js';

export const runnerNetworkEnum = z.enum(['none', 'restricted']);

/**
 * Runner-command and resource-field decisions (PRD §6 + decision doc in
 * `content/packages/SCHEMA_NOTES.md`):
 *
 * 1. `command`: accept both string ("pytest workspace/tests/...") and string
 *    array (["pytest", "workspace/tests/..."]). The author chooses based on
 *    legibility — arrays surface the args list, strings read like a shell
 *    invocation. We normalize at parse-time to a single string by joining
 *    the array with spaces. This keeps `apps/runner`'s `parseCommand`
 *    contract stable (it splits a string back into argv via whitespace) and
 *    means downstream `RunnerStage['command']` stays typed as `string`.
 *
 * 2. `wall_clock_seconds` is canonical. We reject the alternate phrasing
 *    `timeout_seconds` at parse time (via `.passthrough()` + refinement) so
 *    authors do not silently get a timeout that the runner ignores. Authors
 *    pasting shell-style configs (where `timeout_seconds` is common) get a
 *    clear error pointing them at the canonical field.
 *
 * 3. `mode: 'none'` runner stages may omit `command`. Modes `test`, `replay`,
 *    and `mini_experiment` require a non-empty command — `apps/runner`
 *    cannot dispatch without one. Encoded via the refinement below.
 */
export const runnerResourcesSchema = z
  .object({
    cpu: z.number().positive(),
    memory_mb: z.number().int().positive(),
    wall_clock_seconds: z.number().int().positive(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const v = value as Record<string, unknown>;
    if ('timeout_seconds' in v) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timeout_seconds'],
        message:
          "Use 'wall_clock_seconds' instead of 'timeout_seconds' (canonical resource field).",
      });
    }
  });

export const runnerFixtureSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().min(1),
});

const commandValueSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).nonempty(),
]);

function normalizeCommandValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.join(' ');
  return value;
}

export const runnerStageSchema = z
  .preprocess(
    (value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return value;
      }
      const obj = value as Record<string, unknown>;
      const next = { ...obj };
      if ('command' in next) {
        next.command = normalizeCommandValue(next.command);
      }
      return next;
    },
    z
      .object({
        mode: runnerModeEnum,
        command: commandValueSchema.optional(),
        fixtures: z.array(runnerFixtureSchema).optional(),
        output_paths: z.array(z.string()).optional(),
        cpu: z.number().positive().optional(),
        memory_mb: z.number().int().positive().optional(),
        wall_clock_seconds: z.number().int().positive().optional(),
      })
      .passthrough(),
  )
  .superRefine((stage, ctx) => {
    const v = stage as Record<string, unknown>;
    if ('timeout_seconds' in v) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timeout_seconds'],
        message:
          "Use 'wall_clock_seconds' instead of 'timeout_seconds' (canonical resource field).",
      });
    }
    if (stage.mode !== 'none') {
      if (typeof stage.command !== 'string' || stage.command.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['command'],
          message: `command is required when runner mode is '${stage.mode}'`,
        });
      }
    }
  });

export const runnerSchema = z.object({
  image: z.string().min(1),
  default_mode: runnerModeEnum,
  allowed_commands: z.array(z.string()).optional(),
  resources: runnerResourcesSchema,
  network: runnerNetworkEnum,
  stages: z.record(z.string(), runnerStageSchema),
});
