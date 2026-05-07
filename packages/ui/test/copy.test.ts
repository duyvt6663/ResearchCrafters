import { describe, it, expect } from "vitest";
import {
  cope,
  previewBoundary,
  lockedStage,
  mentorWithoutEntitlement,
  mentorRefusal,
  executionFailureCopy,
  runnerOffline,
  mentorUnavailable,
  stageLocked,
  rareBranch,
  suppressedNode,
  emptyCatalog,
  singlePackageEarlyState,
  migrationDiff,
  staleCli,
} from "../src/copy/index.js";
import type { MentorRefusalScope } from "../src/copy/mentor-refusal.js";
import type { ExecutionFailureKind } from "../src/copy/execution-failure.js";

/**
 * Walks a value and yields every string it contains. We use this to assert
 * (a) all copy is non-empty, (b) no copy contains an unfilled `${...}`
 * placeholder leaking from a template literal.
 */
function* allStrings(value: unknown): Iterable<string> {
  if (typeof value === "string") {
    yield value;
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) yield* allStrings(v);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) yield* allStrings(v);
  }
}

function expectStringsClean(label: string, value: unknown): void {
  const strings = [...allStrings(value)];
  expect(strings.length, `${label} produced no strings`).toBeGreaterThan(0);
  for (const s of strings) {
    expect(s.length, `${label} produced an empty string`).toBeGreaterThan(0);
    expect(s, `${label} leaked an unfilled \${} placeholder`).not.toContain("${");
  }
}

describe("copy library", () => {
  it("paywall variants are non-empty and contain no template leaks", () => {
    expectStringsClean("paywall.previewBoundary", previewBoundary());
    expectStringsClean(
      "paywall.previewBoundary(args)",
      previewBoundary({ packageTitle: "Flash Attention", unlocks: ["a", "b"] }),
    );
    expectStringsClean("paywall.lockedStage", lockedStage());
    expectStringsClean(
      "paywall.lockedStage(args)",
      lockedStage({ packageTitle: "Flash Attention" }),
    );
    expectStringsClean(
      "paywall.mentorWithoutEntitlement",
      mentorWithoutEntitlement(),
    );
    expectStringsClean(
      "paywall.mentorWithoutEntitlement(args)",
      mentorWithoutEntitlement({ packageTitle: "Flash Attention" }),
    );
  });

  it("mentor refusal copy is non-empty for every scope", () => {
    const scopes: MentorRefusalScope[] = [
      "solution_request",
      "out_of_context",
      "rate_limit",
      "budget_cap",
      "policy_block",
      "flagged_output",
    ];
    for (const scope of scopes) {
      expectStringsClean(
        `mentorRefusal(${scope})`,
        mentorRefusal({ scope, packageTitle: "Flash Attention" }),
      );
    }
  });

  it("execution failure copy provides title/body/retryHint for every kind", () => {
    const kinds: ExecutionFailureKind[] = [
      "timeout",
      "oom",
      "crash",
      "exit_nonzero",
    ];
    for (const k of kinds) {
      const copy = executionFailureCopy[k]();
      expect(copy.title).toBeTruthy();
      expect(copy.body).toBeTruthy();
      expect(copy.retryHint).toBeTruthy();
      expectStringsClean(`executionFailure(${k})`, copy);
    }
  });

  it("short copy modules return non-empty strings", () => {
    expectStringsClean("runnerOffline", runnerOffline());
    expectStringsClean("mentorUnavailable", mentorUnavailable());
    expectStringsClean("stageLocked", stageLocked());
    expectStringsClean(
      "stageLocked(rule)",
      stageLocked({ rule: "Complete stage 4" }),
    );
    expectStringsClean("rareBranch", rareBranch());
    expectStringsClean("suppressedNode", suppressedNode());
    expectStringsClean("emptyCatalog", emptyCatalog());
    expectStringsClean("singlePackageEarlyState", singlePackageEarlyState());
  });

  it("migrationDiff handles both reset and preserved states", () => {
    expectStringsClean(
      "migrationDiff(reset)",
      migrationDiff({
        changedStages: ["stage-1", "stage-3"],
        resetStateNotice: true,
      }),
    );
    expectStringsClean(
      "migrationDiff(preserved)",
      migrationDiff({ changedStages: [], resetStateNotice: false }),
    );
  });

  it("staleCli embeds version numbers without leaking placeholders", () => {
    const copy = staleCli({ installed: "0.4.2", expected: "0.5.0" });
    expectStringsClean("staleCli", copy);
    expect(copy.body).toContain("0.4.2");
    expect(copy.body).toContain("0.5.0");
  });

  it("cope namespace exposes every category", () => {
    expect(cope.paywall.previewBoundary).toBeTypeOf("function");
    expect(cope.mentor.refusal).toBeTypeOf("function");
    expect(cope.execution.timeout).toBeTypeOf("function");
    expect(cope.runner.offline).toBeTypeOf("function");
    expect(cope.stage.locked).toBeTypeOf("function");
    expect(cope.branch.rare).toBeTypeOf("function");
    expect(cope.empty.catalog).toBeTypeOf("function");
    expect(cope.migration.diff).toBeTypeOf("function");
    expect(cope.cli.stale).toBeTypeOf("function");
  });
});
