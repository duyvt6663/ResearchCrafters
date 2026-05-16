// Unit tests for the enrollment data layer.
//
// The data layer reads enrollments + their pinned package version's stages,
// decision nodes, branches, and node traversals to produce the shapes the
// stage-player and graph route consume. We mock the Prisma client so the
// projection logic is exercised without spinning up Postgres.

import { describe, expect, it, vi, beforeEach } from "vitest";

// Hoisted with the vi.mock factory so the mock spies are initialised before
// the data module is imported (vitest hoists vi.mock to the top of the file).
const {
  enrollmentFindUnique,
  stageFindUnique,
  branchFindMany,
  decisionNodeFindMany,
  nodeTraversalFindMany,
  runFindFirst,
} = vi.hoisted(() => ({
  enrollmentFindUnique: vi.fn(),
  stageFindUnique: vi.fn(),
  branchFindMany: vi.fn(),
  decisionNodeFindMany: vi.fn(),
  nodeTraversalFindMany: vi.fn(),
  runFindFirst: vi.fn(),
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: {
    enrollment: { findUnique: enrollmentFindUnique },
    stage: { findUnique: stageFindUnique },
    branch: { findMany: branchFindMany },
    decisionNode: { findMany: decisionNodeFindMany },
    nodeTraversal: { findMany: nodeTraversalFindMany },
    run: { findFirst: runFindFirst },
  },
  withQueryTimeout: async <T>(p: PromiseLike<T>): Promise<T> => p,
}));

import {
  getDecisionGraph,
  getEnrollmentState,
  getLatestRunIdForStage,
  getStageForEnrollment,
} from "../../data/enrollment.js";

const ENR_ID = "enr-resnet-1";
const PV_ID = "pv-resnet-0_1_0";

beforeEach(() => {
  enrollmentFindUnique.mockReset();
  stageFindUnique.mockReset();
  branchFindMany.mockReset();
  decisionNodeFindMany.mockReset();
  nodeTraversalFindMany.mockReset();
  runFindFirst.mockReset();
});

describe("getEnrollmentState", () => {
  it("returns null for an unknown enrollment id", async () => {
    enrollmentFindUnique.mockResolvedValue(null);
    const result = await getEnrollmentState("missing");
    expect(result).toBeNull();
  });

  it("projects an enrollment row onto the EnrollmentState shape", async () => {
    enrollmentFindUnique.mockResolvedValue({
      id: ENR_ID,
      userId: "u-1",
      packageVersionId: PV_ID,
      activeStageRef: "S002",
      completedStageRefs: ["S001"],
      unlockedNodeRefs: ["N001", "N002"],
      packageVersion: {
        package: { slug: "resnet" },
        stages: [
          { stageId: "S001" },
          { stageId: "S002" },
          { stageId: "S003" },
        ],
      },
    });

    const state = await getEnrollmentState(ENR_ID);
    expect(state).not.toBeNull();
    if (!state) return;

    expect(state.id).toBe(ENR_ID);
    expect(state.packageSlug).toBe("resnet");
    expect(state.packageVersionId).toBe(PV_ID);
    expect(state.activeStageRef).toBe("S002");
    expect(state.completedStageRefs).toEqual(["S001"]);
    // Unlocked stage refs are the union of completed + active.
    expect(state.unlockedStageRefs).toEqual(
      expect.arrayContaining(["S001", "S002"]),
    );
  });
});

describe("getStageForEnrollment", () => {
  it("returns null when the enrollment doesn't exist", async () => {
    enrollmentFindUnique.mockResolvedValue(null);
    const result = await getStageForEnrollment("missing", "S001");
    expect(result).toBeNull();
  });

  it("returns null when the stage isn't part of the enrollment's pinned version", async () => {
    enrollmentFindUnique.mockResolvedValue({
      packageVersionId: PV_ID,
      completedStageRefs: [],
      activeStageRef: "S001",
      packageVersion: { releaseFreeStageIds: ["S001"] },
    });
    stageFindUnique.mockResolvedValue(null);
    const result = await getStageForEnrollment(ENR_ID, "S999");
    expect(result).toBeNull();
  });

  it("derives `current`/free for the active stage and reads the policy prompt", async () => {
    enrollmentFindUnique.mockResolvedValue({
      packageVersionId: PV_ID,
      completedStageRefs: [],
      activeStageRef: "S001",
      packageVersion: { releaseFreeStageIds: ["S001", "S002"] },
    });
    stageFindUnique.mockResolvedValue({
      id: "stg-001-id",
      stageId: "S001",
      title: "Why is going deeper not enough?",
      type: "framing",
      validationKind: "rubric",
      runnerMode: "none",
      estimatedTimeMinutes: 10,
      free: true,
      stagePolicy: {
        prompt: "A 2015-era engineer trains two networks…",
        inputs: { mode: "free_text" },
      },
    });

    const stage = await getStageForEnrollment(ENR_ID, "S001");
    expect(stage).not.toBeNull();
    if (!stage) return;

    // Active + free preview => not locked.
    expect(stage.isLocked).toBe(false);
    expect(stage.isFreePreview).toBe(true);
    // free_text policy mode collapses to writing.
    expect(stage.inputs.mode).toBe("writing");
    expect(stage.inputs.prompt).toBe(
      "A 2015-era engineer trains two networks…",
    );
  });

  it("locks a non-active, non-completed, non-free stage", async () => {
    enrollmentFindUnique.mockResolvedValue({
      packageVersionId: PV_ID,
      completedStageRefs: ["S001"],
      activeStageRef: "S002",
      packageVersion: { releaseFreeStageIds: ["S001", "S002"] },
    });
    stageFindUnique.mockResolvedValue({
      id: "stg-003-id",
      stageId: "S003",
      title: "Implement a residual block.",
      type: "implementation",
      validationKind: "tests",
      runnerMode: "test",
      estimatedTimeMinutes: 30,
      free: false,
      stagePolicy: { inputs: { mode: "code" } },
    });
    branchFindMany.mockResolvedValue([]);

    const stage = await getStageForEnrollment(ENR_ID, "S003");
    expect(stage).not.toBeNull();
    if (!stage) return;
    expect(stage.isLocked).toBe(true);
    expect(stage.isFreePreview).toBe(false);
    expect(stage.inputs.mode).toBe("code");
  });

  it("maps structured math input modes and exposes verified stage evidence", async () => {
    enrollmentFindUnique.mockResolvedValue({
      packageVersionId: PV_ID,
      completedStageRefs: [],
      activeStageRef: "S001M",
      packageVersion: { releaseFreeStageIds: ["S001", "S001M"] },
    });
    stageFindUnique.mockResolvedValue({
      id: "stg-001m-id",
      stageId: "S001M",
      title: "The math behind identity mapping.",
      type: "math",
      validationKind: "rubric",
      runnerMode: "none",
      estimatedTimeMinutes: 10,
      free: true,
      stagePolicy: {
        prompt: "Fill in the residual derivation.",
        inputs: { mode: "mixed_math" },
        evidence_refs: ["artifact/logic/claims.md#identity-is-the-trick"],
        citation_policy: {
          verified_citation_ids: ["artifact/evidence/tables/training-curves.md#plain-vs-residual"],
        },
      },
    });

    const stage = await getStageForEnrollment(ENR_ID, "S001M");
    expect(stage).not.toBeNull();
    if (!stage) return;
    expect(stage.inputs.mode).toBe("math");
    expect(stage.evidence?.map((e) => e.id)).toEqual([
      "artifact/logic/claims.md#identity-is-the-trick",
      "artifact/evidence/tables/training-curves.md#plain-vs-residual",
    ]);
    expect(stage.evidence?.[0]?.verified).toBe(true);
  });

  it("attaches branches for a decision stage", async () => {
    enrollmentFindUnique.mockResolvedValue({
      packageVersionId: PV_ID,
      completedStageRefs: [],
      activeStageRef: "S002",
      packageVersion: { releaseFreeStageIds: ["S001", "S002"] },
    });
    stageFindUnique.mockResolvedValue({
      id: "stg-002-id",
      stageId: "S002",
      title: "Which fix do you attack first?",
      type: "decision",
      validationKind: "rubric",
      runnerMode: "none",
      estimatedTimeMinutes: 15,
      free: true,
      stagePolicy: { inputs: { mode: "mixed" } },
    });
    branchFindMany.mockResolvedValue([
      {
        id: "br-c",
        branchId: "branch-residual-canonical",
        choice: "Reformulate to F(x) + x",
        lesson: "Identity-recovery via parameter-free shortcut.",
        type: "canonical",
        gatedFeedbackVisibility: "after_attempt",
      },
      {
        id: "br-f",
        branchId: "branch-deeper-no-residual",
        choice: "Stack more plain blocks",
        lesson: "BN keeps signals alive but doesn't fix degradation.",
        type: "failed",
        gatedFeedbackVisibility: "after_attempt",
      },
    ]);

    const stage = await getStageForEnrollment(ENR_ID, "S002");
    expect(stage).not.toBeNull();
    if (!stage) return;
    expect(stage.type).toBe("decision");
    expect(stage.decision?.branches).toHaveLength(2);
    const failed = stage.decision?.branches.find((b) => b.type === "failed");
    expect(failed).toBeDefined();
    // Data layer surfaces a conservative default; the page layer + canAccess
    // are responsible for revealing branches.
    expect(failed?.revealed).toBe(false);
  });
});

describe("getDecisionGraph", () => {
  it("returns null for an unknown enrollment", async () => {
    enrollmentFindUnique.mockResolvedValue(null);
    const graph = await getDecisionGraph("missing");
    expect(graph).toBeNull();
  });

  it("derives completed/current/locked status from traversals + completed stages", async () => {
    enrollmentFindUnique.mockResolvedValue({
      packageVersionId: PV_ID,
      activeStageRef: "S003",
      completedStageRefs: ["S001"],
    });
    decisionNodeFindMany.mockResolvedValue([
      { id: "n1-id", nodeId: "N001", title: "Framing", stageRef: "S001" },
      { id: "n2-id", nodeId: "N002", title: "Decision", stageRef: "S002" },
      { id: "n3-id", nodeId: "N003", title: "Implementation", stageRef: "S003" },
      { id: "n4-id", nodeId: "N004", title: "Replay", stageRef: "S004" },
    ]);
    // N002 is completed via a NodeTraversal even though its stage is not in
    // completedStageRefs (the learner picked a branch but hasn't reached the
    // next stage's completion gate yet).
    nodeTraversalFindMany.mockResolvedValue([
      { decisionNodeId: "n2-id" },
    ]);

    const graph = await getDecisionGraph(ENR_ID);
    expect(graph).not.toBeNull();
    if (!graph) return;

    const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
    expect(byId.get("N001")?.status).toBe("completed");
    expect(byId.get("N002")?.status).toBe("completed");
    expect(byId.get("N003")?.status).toBe("current");
    expect(byId.get("N004")?.status).toBe("locked");

    // Sequence edges: ordered nodeId DAG.
    expect(graph.edges).toEqual([
      { from: "N001", to: "N002" },
      { from: "N002", to: "N003" },
      { from: "N003", to: "N004" },
    ]);
  });
});

describe("getLatestRunIdForStage", () => {
  it("returns null when no Run row exists for the stage", async () => {
    runFindFirst.mockResolvedValue(null);
    const id = await getLatestRunIdForStage(ENR_ID, "S003");
    expect(id).toBeNull();
    expect(runFindFirst).toHaveBeenCalledWith({
      where: {
        submission: {
          stageAttempt: { enrollmentId: ENR_ID, stageRef: "S003" },
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
  });

  it("returns the id of the most recent Run row when present", async () => {
    runFindFirst.mockResolvedValue({ id: "run-42" });
    const id = await getLatestRunIdForStage(ENR_ID, "S003");
    expect(id).toBe("run-42");
  });
});
