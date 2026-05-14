/**
 * Execution-failure copy.
 *
 * Execution failure must read clearly distinct from research/grade failure
 * (per `docs/FRONTEND.md` section 11 and `backlog/03` Execution Status).
 * No grade is created until `execution_status=ok`.
 */

export type ExecutionFailureKind =
  | "timeout"
  | "oom"
  | "crash"
  | "exit_nonzero";

export interface ExecutionFailureCopy {
  title: string;
  body: string;
  retryHint: string;
}

const COPY: Record<ExecutionFailureKind, ExecutionFailureCopy> = {
  timeout: {
    title: "Run hit the wall-clock timeout.",
    body: "The runner stopped your submission before it finished. This was not graded.",
    retryHint:
      "Profile the slow path locally with `researchcrafters test`, then resubmit.",
  },
  oom: {
    title: "Run ran out of memory.",
    body: "The sandbox killed the process before it produced artifacts. No grade was assigned.",
    retryHint:
      "Reduce batch sizes, free large objects, and rerun locally before submitting.",
  },
  crash: {
    title: "Sandbox or runtime crashed.",
    body: "The runner did not produce a clean exit. This is not a grade — try again.",
    retryHint:
      "Check the run logs for the failing frame, then resubmit. Persistent crashes should be reported.",
  },
  exit_nonzero: {
    title: "Command exited with a non-zero code.",
    body: "Your code ran but returned a failing exit status. The evaluator was not invoked.",
    retryHint:
      "Run `researchcrafters test` locally to surface the same exit code, then resubmit.",
  },
};

export function executionFailure(
  kind: ExecutionFailureKind,
): ExecutionFailureCopy {
  return COPY[kind];
}

export const executionFailureCopy = {
  timeout: () => COPY.timeout,
  oom: () => COPY.oom,
  crash: () => COPY.crash,
  exit_nonzero: () => COPY.exit_nonzero,
} as const;
