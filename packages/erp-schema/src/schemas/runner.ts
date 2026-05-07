import { z } from 'zod';
import { runnerModeEnum } from './stage.js';

export const runnerNetworkEnum = z.enum(['none', 'restricted']);

export const runnerResourcesSchema = z.object({
  cpu: z.number().positive(),
  memory_mb: z.number().int().positive(),
  wall_clock_seconds: z.number().int().positive(),
});

export const runnerFixtureSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().min(1),
});

export const runnerStageSchema = z.object({
  mode: runnerModeEnum,
  command: z.string().min(1),
  fixtures: z.array(runnerFixtureSchema).optional(),
  output_paths: z.array(z.string()).optional(),
  cpu: z.number().positive().optional(),
  memory_mb: z.number().int().positive().optional(),
  wall_clock_seconds: z.number().int().positive().optional(),
});

export const runnerSchema = z.object({
  image: z.string().min(1),
  default_mode: runnerModeEnum,
  allowed_commands: z.array(z.string()).optional(),
  resources: runnerResourcesSchema,
  network: runnerNetworkEnum,
  stages: z.record(z.string(), runnerStageSchema),
});
