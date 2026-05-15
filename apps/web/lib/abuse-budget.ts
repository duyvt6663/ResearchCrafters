/**
 * Abuse-control retry budget tracking.
 *
 * Backlog/03 §Execution Status:
 *   "Track abuse-control retry budget separately from graded attempts."
 *
 * A learner's StageAttempt rows fall into a few categories based on
 * `executionStatus`:
 *
 *   - `ok`                                                 → graded attempt
 *   - `timeout | oom | crash | exit_nonzero`               → retry (runner ran,
 *                                                            but no grade)
 *   - `queued | running | null`                            → pending
 *   - `not_required`                                       → ungated (writing /
 *                                                            decision stages)
 *
 * Graded attempts are what learners care about — the count surfaced in the UI,
 * leaderboards, and pedagogical metrics. They should never include retries
 * caused by sandbox failures, because that would punish learners for runner
 * flakiness or transient infra issues.
 *
 * The abuse-control budget is what the platform cares about — every runner
 * execution costs CPU/memory and creates abuse surface. A retry budget must
 * include *every* attempt that consumed runner capacity (graded + failed),
 * because a learner spamming retries to exhaust the runner pool is exactly
 * the abuse case we want to throttle.
 *
 * This module is the single source of truth for that classification. Callers:
 *   - the submissions / stage-attempts routes, to decide whether to throttle
 *     before enqueuing more runner work,
 *   - the status / progress UI, to display the "graded attempts" count without
 *     polluting it with retries,
 *   - account-cascade exports, to break down per-attempt activity.
 */

export type AttemptClassification =
  | "graded"
  | "retry"
  | "pending"
  | "not_required";

const GRADED_STATUSES: ReadonlySet<string> = new Set(["ok"]);

const RETRY_STATUSES: ReadonlySet<string> = new Set([
  "timeout",
  "oom",
  "crash",
  "exit_nonzero",
]);

const PENDING_STATUSES: ReadonlySet<string> = new Set(["queued", "running"]);

/**
 * Classify a single attempt by its `executionStatus`. The `passed` flag is
 * accepted for callers that already have the row in hand, but does NOT change
 * the abuse classification: a learner who fails grading after a successful
 * run still consumed graded-attempt capacity.
 */
export function classifyAttempt(
  executionStatus: string | null | undefined,
): AttemptClassification {
  if (executionStatus === "not_required") return "not_required";
  if (!executionStatus) return "pending";
  if (GRADED_STATUSES.has(executionStatus)) return "graded";
  if (RETRY_STATUSES.has(executionStatus)) return "retry";
  if (PENDING_STATUSES.has(executionStatus)) return "pending";
  // Unknown status strings are treated as pending rather than counted; the
  // status union is enforced upstream in the callback validator, so an
  // unknown value here means we shipped a new status without teaching the
  // budget about it. Don't let that retroactively re-grade a learner.
  return "pending";
}

export interface AttemptLike {
  executionStatus?: string | null;
}

export interface AbuseBudgetSummary {
  /** Count of attempts that produced a grade (executionStatus === "ok"). */
  gradedAttempts: number;
  /** Count of attempts the runner ran but that failed without a grade. */
  retryAttempts: number;
  /** Count of attempts still in the runner pipeline. */
  pendingAttempts: number;
  /** Count of attempts on stages that do not require runner execution. */
  notRequiredAttempts: number;
  /**
   * Total runner executions charged to the abuse-control budget.
   *
   * `gradedAttempts + retryAttempts` — every attempt that actually consumed
   * runner capacity. `pendingAttempts` are intentionally excluded because
   * they have not yet committed; they will roll into one of graded/retry
   * when the callback lands.
   */
  retryBudgetUsed: number;
}

/**
 * Summarize a list of attempts into graded vs. retry-budget counts.
 *
 * This is a pure function — the caller is responsible for fetching the rows
 * it cares about (e.g. by user, by enrollment, by package, by time window).
 * Keeping the classifier pure means tests can pin every classification rule
 * without standing up a Prisma client.
 */
export function summarizeAttempts(
  attempts: ReadonlyArray<AttemptLike>,
): AbuseBudgetSummary {
  let graded = 0;
  let retry = 0;
  let pending = 0;
  let notRequired = 0;
  for (const attempt of attempts) {
    switch (classifyAttempt(attempt.executionStatus)) {
      case "graded":
        graded += 1;
        break;
      case "retry":
        retry += 1;
        break;
      case "pending":
        pending += 1;
        break;
      case "not_required":
        notRequired += 1;
        break;
    }
  }
  return {
    gradedAttempts: graded,
    retryAttempts: retry,
    pendingAttempts: pending,
    notRequiredAttempts: notRequired,
    retryBudgetUsed: graded + retry,
  };
}

/**
 * Decide whether another runner execution is allowed under the abuse-control
 * budget. The budget is expressed as a hard cap on `retryBudgetUsed`; once a
 * learner has burned through it the runner stops accepting new submissions
 * until the budget refreshes (out of scope here — the refresh window is owned
 * by the rate-limiter wired in apps/runner/src/security.ts).
 *
 * Returns `{ allowed: true }` when there is budget left, otherwise
 * `{ allowed: false, reason }` with a human-readable reason the API can
 * surface to the CLI.
 */
export function checkAbuseBudget(
  summary: AbuseBudgetSummary,
  limit: number,
): { allowed: true } | { allowed: false; reason: string } {
  if (!Number.isFinite(limit) || limit <= 0) {
    return { allowed: true };
  }
  if (summary.retryBudgetUsed >= limit) {
    return {
      allowed: false,
      reason: `retry budget exhausted (${summary.retryBudgetUsed}/${limit})`,
    };
  }
  return { allowed: true };
}
