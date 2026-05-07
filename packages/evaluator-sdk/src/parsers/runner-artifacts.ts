import { z } from 'zod';
import type { ExecutionStatus, RunArtifacts } from '../types.js';

/**
 * The runner writes a JSON artifact at the path declared in `runner.yaml`
 * `outputs.result_json`. This module parses that JSON into the typed
 * `RunArtifacts` shape consumed by `gradeAttempt`.
 */

const testResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
});

const rawArtifactSchema = z.object({
  execution_status: z.enum(['ok', 'timeout', 'oom', 'crash', 'exit_nonzero']),
  test_results: z.array(testResultSchema).optional(),
  metrics: z.record(z.string(), z.number()).optional(),
  artifact_pointers: z.record(z.string(), z.string()).optional(),
  text_outputs: z.record(z.string(), z.string()).optional(),
});

export class RunnerArtifactParseError extends Error {
  constructor(message: string, public readonly issues?: unknown) {
    super(message);
    this.name = 'RunnerArtifactParseError';
  }
}

export function parseRunnerArtifacts(input: unknown): RunArtifacts {
  const parsed = rawArtifactSchema.safeParse(input);
  if (!parsed.success) {
    throw new RunnerArtifactParseError(
      'invalid runner artifact JSON',
      parsed.error.issues,
    );
  }
  const data = parsed.data;
  const testResults =
    data.test_results !== undefined
      ? data.test_results.map((r) => ({
          name: r.name,
          passed: r.passed,
          ...(r.message !== undefined ? { message: r.message } : {}),
        }))
      : undefined;
  const out: RunArtifacts = {
    executionStatus: data.execution_status as ExecutionStatus,
    ...(testResults !== undefined ? { testResults } : {}),
    ...(data.metrics !== undefined ? { metrics: data.metrics } : {}),
    ...(data.artifact_pointers !== undefined
      ? { artifactPointers: data.artifact_pointers }
      : {}),
    ...(data.text_outputs !== undefined ? { textOutputs: data.text_outputs } : {}),
  };
  return out;
}
