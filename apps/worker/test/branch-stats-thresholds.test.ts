// Targeted edge-case tests for `computePercent`'s NODE_MIN_N / BRANCH_MIN_N
// gating. The existing `branch-stats.test.ts` covers the "below threshold"
// suppression path with `_MIN_N - 1`, but never exercises the boundary
// itself — the threshold value must PASS, not be suppressed off-by-one.
//
// Coverage gap (per qa-test-coverage report task 2): we want explicit
// boundary tests at N=20 / N=5 (pass) and N=19 / N=4 (suppress) so any
// future change to the constants surfaces here as well as in code review.

import { describe, expect, it } from "vitest";
import {
  BRANCH_MIN_N,
  NODE_MIN_N,
  computePercent,
} from "../src/jobs/branch-stats-rollup.js";

describe("computePercent — exact threshold boundaries", () => {
  it("publishes a percent when nodeN equals NODE_MIN_N (boundary inclusive)", () => {
    // 5 / 20 = 25% — a multiple of 5, no rounding ambiguity.
    expect(NODE_MIN_N).toBe(20);
    expect(BRANCH_MIN_N).toBe(5);
    expect(computePercent(BRANCH_MIN_N, NODE_MIN_N)).toBe(25);
  });

  it("suppresses when nodeN is exactly NODE_MIN_N - 1 (just below threshold)", () => {
    expect(computePercent(BRANCH_MIN_N, NODE_MIN_N - 1)).toBeNull();
  });

  it("suppresses when branchN is exactly BRANCH_MIN_N - 1 (just below threshold)", () => {
    // Node well above its own threshold so the branchN check is the only one
    // that should fire.
    expect(computePercent(BRANCH_MIN_N - 1, NODE_MIN_N + 50)).toBeNull();
  });

  it("publishes when both N values sit exactly at the threshold", () => {
    // BRANCH_MIN_N=5, NODE_MIN_N=20 → 5/20=25%.
    const result = computePercent(BRANCH_MIN_N, NODE_MIN_N);
    expect(result).not.toBeNull();
    // Sanity: the published percent is rounded to nearest 5.
    if (result !== null) expect(result % 5).toBe(0);
  });

  it("returns null when nodeN is zero (division-by-zero guard)", () => {
    expect(computePercent(0, 0)).toBeNull();
  });

  it("publishes 100% when every traversal at the node hit the same branch (branchN == nodeN >= NODE_MIN_N)", () => {
    expect(computePercent(NODE_MIN_N, NODE_MIN_N)).toBe(100);
  });
});
