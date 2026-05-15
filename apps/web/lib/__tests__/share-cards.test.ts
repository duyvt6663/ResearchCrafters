import { describe, expect, it } from "vitest";
import {
  buildShareCardPayload,
  safeCohortPercentage,
  SHARE_CARD_BRANCH_MIN_N,
  SHARE_CARD_NODE_MIN_N,
} from "../share-cards";

describe("buildShareCardPayload", () => {
  const baseEnrollment = {
    packageSlug: "resnet",
    packageVersionId: "pv-1",
    completedStageRefs: ["S001", "S002"] as const,
  };
  const basePkg = {
    stages: [{ ref: "S001" }, { ref: "S002" }, { ref: "S003" }],
    sampleDecision: { prompt: "Pick init strategy" },
  };

  it("derives in_progress + score summary from completed stage count", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
    });
    expect(payload.completionStatus).toBe("in_progress");
    expect(payload.scoreSummary).toEqual({ passed: 2, total: 3 });
  });

  it("derives complete when every authored stage is in completedStageRefs", () => {
    const payload = buildShareCardPayload({
      enrollment: {
        ...baseEnrollment,
        completedStageRefs: ["S001", "S002", "S003"],
      },
      pkg: basePkg,
      insight: "",
    });
    expect(payload.completionStatus).toBe("complete");
  });

  it("falls back to sampleDecision.prompt when caller omits hardestDecision", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
    });
    expect(payload.hardestDecision).toBe("Pick init strategy");
  });

  it("prefers caller-supplied hardestDecision over sampleDecision", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
      hardestDecision: "S002",
    });
    expect(payload.hardestDecision).toBe("S002");
  });

  it("maps authored 'failed' branch to public 'alternative'", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
      selectedBranchType: "failed",
    });
    expect(payload.selectedBranchType).toBe("alternative");
  });

  it("passes 'canonical' and 'suboptimal' through unchanged", () => {
    expect(
      buildShareCardPayload({
        enrollment: baseEnrollment,
        pkg: basePkg,
        insight: "",
        selectedBranchType: "canonical",
      }).selectedBranchType,
    ).toBe("canonical");
    expect(
      buildShareCardPayload({
        enrollment: baseEnrollment,
        pkg: basePkg,
        insight: "",
        selectedBranchType: "suboptimal",
      }).selectedBranchType,
    ).toBe("suboptimal");
  });

  it("omits selectedBranchType when not provided", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
    });
    expect(payload.selectedBranchType).toBeUndefined();
  });

  it("suppresses cohort percentage by default (null = suppressed per backlog/06)", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
    });
    expect(payload.cohortPercentage).toBeNull();
  });

  it("passes a caller-supplied cohort percentage through verbatim", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
      cohortPercentage: 65,
    });
    expect(payload.cohortPercentage).toBe(65);
  });

  it("passes the learner insight through verbatim", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "Residuals shift identity into init.",
    });
    expect(payload.learnerInsight).toBe(
      "Residuals shift identity into init.",
    );
  });

  it("handles a null package (e.g. stale snapshot) without throwing", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: null,
      insight: "",
    });
    expect(payload.completionStatus).toBe("in_progress");
    expect(payload.scoreSummary).toEqual({ passed: 2, total: 0 });
    expect(payload.hardestDecision).toBeUndefined();
  });
});

describe("safeCohortPercentage — minimum-N suppression", () => {
  it("matches worker thresholds (NODE_MIN_N=20, BRANCH_MIN_N=5)", () => {
    // Pinned to the worker rollup constants in
    // `apps/worker/src/jobs/branch-stats-rollup.ts`. If the worker shifts
    // either threshold this test must be updated alongside it.
    expect(SHARE_CARD_NODE_MIN_N).toBe(20);
    expect(SHARE_CARD_BRANCH_MIN_N).toBe(5);
  });

  it("publishes when both N values sit exactly at the threshold", () => {
    expect(
      safeCohortPercentage({
        nodeN: SHARE_CARD_NODE_MIN_N,
        branchN: SHARE_CARD_BRANCH_MIN_N,
      }),
    ).toBe(25);
  });

  it("suppresses when nodeN is one below the node threshold", () => {
    expect(
      safeCohortPercentage({
        nodeN: SHARE_CARD_NODE_MIN_N - 1,
        branchN: SHARE_CARD_BRANCH_MIN_N,
      }),
    ).toBeNull();
  });

  it("suppresses when branchN is one below the branch threshold", () => {
    expect(
      safeCohortPercentage({
        nodeN: SHARE_CARD_NODE_MIN_N + 50,
        branchN: SHARE_CARD_BRANCH_MIN_N - 1,
      }),
    ).toBeNull();
  });

  it("suppresses NaN / non-finite samples", () => {
    expect(safeCohortPercentage({ nodeN: Number.NaN, branchN: 10 })).toBeNull();
    expect(
      safeCohortPercentage({ nodeN: Infinity, branchN: 10 }),
    ).toBeNull();
  });

  it("suppresses degenerate samples (negative branchN, branchN > nodeN, zero nodeN)", () => {
    expect(safeCohortPercentage({ nodeN: 0, branchN: 0 })).toBeNull();
    expect(safeCohortPercentage({ nodeN: 50, branchN: -1 })).toBeNull();
    expect(safeCohortPercentage({ nodeN: 20, branchN: 21 })).toBeNull();
  });

  it("rounds to the nearest 5% (matches worker rollup bucketing)", () => {
    // 13 / 21 ≈ 61.9% → bucketed to 60%.
    expect(safeCohortPercentage({ nodeN: 21, branchN: 13 })).toBe(60);
    // 14 / 21 ≈ 66.7% → bucketed to 65%.
    expect(safeCohortPercentage({ nodeN: 21, branchN: 14 })).toBe(65);
  });
});

describe("buildShareCardPayload — cohort leak prevention", () => {
  const baseEnrollment = {
    packageSlug: "resnet",
    packageVersionId: "pv-1",
    completedStageRefs: ["S001"] as const,
  };
  const basePkg = {
    stages: [{ ref: "S001" }, { ref: "S002" }],
    sampleDecision: null,
  };

  it("derives a cohort percentage from a sample that clears minimum-N", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
      cohortSample: { nodeN: 40, branchN: 10 },
    });
    expect(payload.cohortPercentage).toBe(25);
  });

  it("suppresses cohort when the sample is below the node threshold", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
      cohortSample: {
        nodeN: SHARE_CARD_NODE_MIN_N - 1,
        branchN: SHARE_CARD_BRANCH_MIN_N,
      },
    });
    expect(payload.cohortPercentage).toBeNull();
  });

  it("suppresses cohort when the sample is below the branch threshold", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
      cohortSample: { nodeN: 200, branchN: SHARE_CARD_BRANCH_MIN_N - 1 },
    });
    expect(payload.cohortPercentage).toBeNull();
  });

  it("treats cohortSample as authoritative — a low-N sample suppresses even when caller also passes a percentage", () => {
    // Regression for backlog/00-roadmap.md:105: a misbehaving caller must
    // not be able to leak a low-N percentage by passing both fields.
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
      cohortPercentage: 80,
      cohortSample: { nodeN: 3, branchN: 2 },
    });
    expect(payload.cohortPercentage).toBeNull();
  });

  it("suppresses non-finite cohortPercentage even when no sample is supplied", () => {
    const payload = buildShareCardPayload({
      enrollment: baseEnrollment,
      pkg: basePkg,
      insight: "",
      cohortPercentage: Number.NaN,
    });
    expect(payload.cohortPercentage).toBeNull();
  });
});
