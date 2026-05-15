import { describe, expect, it } from "vitest";
import {
  checkAbuseBudget,
  classifyAttempt,
  summarizeAttempts,
} from "../abuse-budget";

describe("classifyAttempt", () => {
  it("classifies ok as graded", () => {
    expect(classifyAttempt("ok")).toBe("graded");
  });

  it.each(["timeout", "oom", "crash", "exit_nonzero"] as const)(
    "classifies %s as retry",
    (status) => {
      expect(classifyAttempt(status)).toBe("retry");
    },
  );

  it.each(["queued", "running"] as const)("classifies %s as pending", (status) => {
    expect(classifyAttempt(status)).toBe("pending");
  });

  it("classifies null / undefined / empty as pending", () => {
    expect(classifyAttempt(null)).toBe("pending");
    expect(classifyAttempt(undefined)).toBe("pending");
    expect(classifyAttempt("")).toBe("pending");
  });

  it("classifies not_required as not_required", () => {
    expect(classifyAttempt("not_required")).toBe("not_required");
  });

  it("classifies unknown statuses as pending (fail-safe)", () => {
    expect(classifyAttempt("rejected_by_policy")).toBe("pending");
  });
});

describe("summarizeAttempts", () => {
  it("returns zeros for an empty list", () => {
    expect(summarizeAttempts([])).toEqual({
      gradedAttempts: 0,
      retryAttempts: 0,
      pendingAttempts: 0,
      notRequiredAttempts: 0,
      retryBudgetUsed: 0,
    });
  });

  it("counts graded vs retry vs pending vs not_required independently", () => {
    const summary = summarizeAttempts([
      { executionStatus: "ok" },
      { executionStatus: "ok" },
      { executionStatus: "timeout" },
      { executionStatus: "oom" },
      { executionStatus: "crash" },
      { executionStatus: "exit_nonzero" },
      { executionStatus: "queued" },
      { executionStatus: "running" },
      { executionStatus: null },
      { executionStatus: "not_required" },
    ]);
    expect(summary).toEqual({
      gradedAttempts: 2,
      retryAttempts: 4,
      pendingAttempts: 3,
      notRequiredAttempts: 1,
      retryBudgetUsed: 6,
    });
  });

  it("retryBudgetUsed excludes pending attempts so in-flight runs don't charge twice", () => {
    const summary = summarizeAttempts([
      { executionStatus: "queued" },
      { executionStatus: "queued" },
      { executionStatus: "running" },
    ]);
    expect(summary.retryBudgetUsed).toBe(0);
    expect(summary.pendingAttempts).toBe(3);
  });

  it("retryBudgetUsed counts a graded attempt that subsequently failed grading", () => {
    // A learner can have executionStatus=ok with no/low score — the runner
    // still ran, so it charges the abuse budget.
    const summary = summarizeAttempts([
      { executionStatus: "ok" },
      { executionStatus: "ok" },
    ]);
    expect(summary.retryBudgetUsed).toBe(2);
    expect(summary.gradedAttempts).toBe(2);
  });
});

describe("checkAbuseBudget", () => {
  const baseSummary = {
    gradedAttempts: 0,
    retryAttempts: 0,
    pendingAttempts: 0,
    notRequiredAttempts: 0,
    retryBudgetUsed: 0,
  };

  it("allows submissions when retryBudgetUsed is under the limit", () => {
    const decision = checkAbuseBudget(
      { ...baseSummary, retryBudgetUsed: 5 },
      10,
    );
    expect(decision).toEqual({ allowed: true });
  });

  it("rejects submissions when retryBudgetUsed has reached the limit", () => {
    const decision = checkAbuseBudget(
      { ...baseSummary, retryBudgetUsed: 10 },
      10,
    );
    expect(decision).toEqual({
      allowed: false,
      reason: "retry budget exhausted (10/10)",
    });
  });

  it("rejects submissions when retryBudgetUsed exceeds the limit", () => {
    const decision = checkAbuseBudget(
      { ...baseSummary, retryBudgetUsed: 11 },
      10,
    );
    expect(decision).toEqual({
      allowed: false,
      reason: "retry budget exhausted (11/10)",
    });
  });

  it("treats limit <= 0 or non-finite as unbounded", () => {
    expect(
      checkAbuseBudget({ ...baseSummary, retryBudgetUsed: 999 }, 0),
    ).toEqual({ allowed: true });
    expect(
      checkAbuseBudget({ ...baseSummary, retryBudgetUsed: 999 }, -1),
    ).toEqual({ allowed: true });
    expect(
      checkAbuseBudget(
        { ...baseSummary, retryBudgetUsed: 999 },
        Number.POSITIVE_INFINITY,
      ),
    ).toEqual({ allowed: true });
  });
});
