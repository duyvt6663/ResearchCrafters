import type { ExecutionStatus } from './types.js';

/**
 * Sandbox-level exit reasons. The Docker adapter (or any other sandbox) maps
 * its native signals to this typed shape so the rest of the runner pipeline
 * never deals with raw container codes.
 */
export type SandboxExitReason =
  | { kind: 'success' }
  | { kind: 'nonzero_exit'; code: number }
  | { kind: 'timeout' }
  | { kind: 'oom' }
  | { kind: 'killed_signal'; signal: string }
  | { kind: 'sandbox_error'; message: string };

/**
 * Pure mapping from sandbox exit reason to evaluator-facing
 * `ExecutionStatus`. `killed_signal` and `sandbox_error` both surface as
 * `crash` because both indicate the sandbox itself misbehaved.
 */
export function mapExitReason(reason: SandboxExitReason): ExecutionStatus {
  switch (reason.kind) {
    case 'success':
      return 'ok';
    case 'nonzero_exit':
      return 'exit_nonzero';
    case 'timeout':
      return 'timeout';
    case 'oom':
      return 'oom';
    case 'killed_signal':
    case 'sandbox_error':
      return 'crash';
  }
}
