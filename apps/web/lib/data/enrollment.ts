// Enrollment data layer. Backed by Prisma; pages and route handlers consume
// the lightweight shapes below so the existing UI components keep their
// contract.
//
// Stage records are derived from `Stage` rows mirroring the enrollment's
// pinned `PackageVersion`. Decision graphs are derived from `DecisionNode`
// + `Branch` rows belonging to the same version.

import { prisma, withQueryTimeout } from "@researchcrafters/db";

export type StageInputsMode =
  | "decision"
  | "writing"
  | "analysis"
  | "code"
  | "experiment"
  | "reflection"
  | "review";

export type StageRecord = {
  id: string;
  ref: string;
  title: string;
  type: StageInputsMode;
  inputs: { mode: StageInputsMode; prompt: string };
  isLocked: boolean;
  isFreePreview: boolean;
  estimatedMinutes: number;
  expectedCliMinVersion?: string;
  decision?: {
    branches: ReadonlyArray<{
      id: string;
      label: string;
      summary: string;
      type: "canonical" | "suboptimal" | "failed";
      revealed: boolean;
    }>;
  };
  rubric?: ReadonlyArray<{ id: string; label: string; weight: number }>;
  artifact?: { kind: "log" | "table" | "plot"; caption: string };
};

export type EnrollmentState = {
  id: string;
  userId: string | null;
  packageSlug: string;
  packageVersionId: string;
  activeStageRef: string;
  unlockedStageRefs: readonly string[];
  completedStageRefs: readonly string[];
};

export type DecisionGraph = {
  nodes: ReadonlyArray<{
    id: string;
    stageRef: string;
    title: string;
    status: "current" | "completed" | "locked";
  }>;
  edges: ReadonlyArray<{ from: string; to: string }>;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function inferMode(stageType: string, validationKind: string): StageInputsMode {
  // Mirror the union the UI expects. The Prisma stage `type` is free-form
  // (mirrored from the package YAML) so we map common values, falling back
  // to `validationKind` when `type` is opaque.
  switch (stageType) {
    case "decision":
    case "writing":
    case "analysis":
    case "code":
    case "experiment":
    case "reflection":
    case "review":
      return stageType;
    case "framing":
      return "writing";
    case "implementation":
    case "math":
      return "code";
  }
  switch (validationKind) {
    case "tests":
      return "code";
    case "replay":
      return "experiment";
    case "rubric":
      return "writing";
    case "mini_experiment":
      return "experiment";
    default:
      return "writing";
  }
}

/**
 * Resolve the stage `inputs.mode` from the authored stage policy. The
 * authored mode (`free_text`/`code`/`mixed`/...) is mirrored as-is on the
 * `stagePolicy` JSON column; we map it onto the UI's stage-mode union.
 * Returns `null` when no policy mode is present.
 */
function modeFromPolicy(policy: unknown): StageInputsMode | null {
  if (!policy || typeof policy !== "object") return null;
  const inputs = (policy as { inputs?: unknown }).inputs;
  if (!inputs || typeof inputs !== "object") return null;
  const mode = (inputs as { mode?: unknown }).mode;
  switch (mode) {
    case "code":
      return "code";
    case "experiment":
      return "experiment";
    case "free_text":
      return "writing";
    case "multiple_choice":
      return "decision";
    case "mixed":
      // Mixed inputs collapse to "decision" when the stage carries branches
      // and to "writing" otherwise; the caller layers branch detection on
      // top so we err on the writing side here.
      return null;
    default:
      return null;
  }
}

/**
 * Read an enrollment by id and project it to {@link EnrollmentState}.
 * Returns `null` when the enrollment doesn't exist.
 */
export async function getEnrollmentState(
  id: string,
): Promise<EnrollmentState | null> {
  const row = await withQueryTimeout(
    prisma.enrollment.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        packageVersionId: true,
        activeStageRef: true,
        completedStageRefs: true,
        unlockedNodeRefs: true,
        packageVersion: {
          select: {
            package: { select: { slug: true } },
            stages: {
              orderBy: { stageId: "asc" },
              select: { stageId: true },
            },
          },
        },
      },
    }),
  );
  if (!row) return null;

  const completedStageRefs = asStringArray(row.completedStageRefs);
  // unlockedNodeRefs in the schema tracks decision nodes; we surface stage
  // refs the learner can reach. Default: completed stages + the active
  // stage. Stricter unlock logic (release.free_stages, prerequisites) lives
  // in the canAccess policy, not here.
  const allStageRefs = row.packageVersion.stages.map((s) => s.stageId);
  const activeRef = row.activeStageRef ?? allStageRefs[0] ?? "";
  const unlockedStageRefs = Array.from(
    new Set([...completedStageRefs, activeRef].filter((s) => s.length > 0)),
  );

  return {
    id: row.id,
    userId: row.userId,
    packageSlug: row.packageVersion.package.slug,
    packageVersionId: row.packageVersionId,
    activeStageRef: activeRef,
    unlockedStageRefs,
    completedStageRefs,
  };
}

/**
 * Read a stage by ref within the context of an enrollment. The ref is the
 * YAML stage id (`Stage.stageId`); we look it up against the enrollment's
 * pinned package version so callers can't request a stage from a different
 * version.
 */
export async function getStageForEnrollment(
  enrollmentId: string,
  stageRef: string,
): Promise<StageRecord | null> {
  const enr = await withQueryTimeout(
    prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        packageVersionId: true,
        completedStageRefs: true,
        activeStageRef: true,
        packageVersion: { select: { releaseFreeStageIds: true } },
      },
    }),
  );
  if (!enr) return null;

  const stage = await withQueryTimeout(
    prisma.stage.findUnique({
      where: {
        packageVersionId_stageId: {
          packageVersionId: enr.packageVersionId,
          stageId: stageRef,
        },
      },
      select: {
        id: true,
        stageId: true,
        title: true,
        type: true,
        validationKind: true,
        runnerMode: true,
        estimatedTimeMinutes: true,
        free: true,
        stagePolicy: true,
      },
    }),
  );
  if (!stage) return null;

  const completed = asStringArray(enr.completedStageRefs);
  const isFreePreview =
    stage.free &&
    enr.packageVersion.releaseFreeStageIds.includes(stage.stageId);

  // A stage is "locked" if it's neither completed nor the active stage and
  // it's not part of the free preview. Real prerequisite logic mirrors the
  // graph; for the MVP we use this lightweight sequencing.
  const isLocked =
    !isFreePreview &&
    enr.activeStageRef !== stage.stageId &&
    !completed.includes(stage.stageId);

  // Prefer the authored stage_policy.inputs.mode (mirrored verbatim into the
  // policy JSON); fall back to a type/validation-derived guess so older
  // packages without the policy block still render.
  const policyMode = modeFromPolicy(stage.stagePolicy);
  const mode: StageInputsMode =
    policyMode ?? inferMode(stage.type, stage.validationKind);

  // Decision branches: only attached when the stage is a decision stage AND
  // it's the entry of a decision node. The graph edges live on
  // DecisionNode/Branch in the same package version.
  let decision: StageRecord["decision"];
  if (mode === "decision") {
    const branches = await withQueryTimeout(
      prisma.branch.findMany({
        where: {
          packageVersionId: enr.packageVersionId,
          decisionNode: { stageRef: stage.stageId },
        },
        orderBy: { branchId: "asc" },
        select: {
          id: true,
          branchId: true,
          choice: true,
          lesson: true,
          type: true,
          gatedFeedbackVisibility: true,
        },
      }),
    );
    if (branches.length > 0) {
      decision = {
        branches: branches.map((b) => ({
          id: b.branchId,
          label: b.choice,
          summary: b.lesson,
          type:
            b.type === "canonical" || b.type === "suboptimal" || b.type === "failed"
              ? b.type
              : "suboptimal",
          // Visibility is a policy concern; the data layer surfaces a
          // conservative default and lets canAccess + the UI reveal more.
          revealed: false,
        })),
      };
    }
  }

  // Pull the prompt out of the stagePolicy mirror when present; the policy
  // JSON includes the authoring prompt for decision stages.
  const policy = (stage.stagePolicy ?? {}) as {
    prompt?: unknown;
    rubric?: unknown;
  };
  const prompt = typeof policy.prompt === "string" ? policy.prompt : stage.title;
  const rubric = Array.isArray(policy.rubric)
    ? (policy.rubric as ReadonlyArray<unknown>)
        .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
        .map((r) => ({
          id: typeof r["id"] === "string" ? r["id"] : "",
          label: typeof r["label"] === "string" ? r["label"] : "",
          weight: typeof r["weight"] === "number" ? r["weight"] : 0,
        }))
    : undefined;

  // Build the record without ever assigning `undefined` so the strict
  // exactOptionalPropertyTypes check in tsconfig stays happy.
  const record: StageRecord = {
    id: stage.id,
    ref: stage.stageId,
    title: stage.title,
    type: mode,
    inputs: { mode, prompt },
    isLocked,
    isFreePreview,
    estimatedMinutes: stage.estimatedTimeMinutes,
  };
  if (decision !== undefined) record.decision = decision;
  if (rubric !== undefined) record.rubric = rubric;
  return record;
}

/**
 * Read the decision-graph payload for an enrollment. Returns nodes scoped to
 * the pinned package version with derived status (current / completed /
 * locked) based on the enrollment progress, plus edges between sequential
 * decision nodes for the same stage. Returns `null` when the enrollment
 * doesn't exist.
 *
 * Status derivation priority:
 *   1. Any DecisionNode that has a {@link NodeTraversal} row for this
 *      enrollment is "completed".
 *   2. The DecisionNode whose `stageRef` matches `enrollment.activeStageRef`
 *      is "current".
 *   3. Everything else is "locked".
 */
export async function getDecisionGraph(
  enrollmentId: string,
): Promise<DecisionGraph | null> {
  const enr = await withQueryTimeout(
    prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        packageVersionId: true,
        activeStageRef: true,
        completedStageRefs: true,
      },
    }),
  );
  if (!enr) return null;

  const completedStageRefs = asStringArray(enr.completedStageRefs);
  const [decisionNodes, traversals] = await Promise.all([
    withQueryTimeout(
      prisma.decisionNode.findMany({
        where: { packageVersionId: enr.packageVersionId },
        orderBy: { nodeId: "asc" },
        select: {
          id: true,
          nodeId: true,
          title: true,
          stageRef: true,
        },
      }),
    ),
    withQueryTimeout(
      prisma.nodeTraversal.findMany({
        where: { enrollmentId },
        select: { decisionNodeId: true },
      }),
    ),
  ]);

  const traversedNodeIds = new Set(traversals.map((t) => t.decisionNodeId));

  const nodes = decisionNodes.map((n) => {
    const completedByStage =
      n.stageRef !== null && completedStageRefs.includes(n.stageRef);
    const completedByTraversal = traversedNodeIds.has(n.id);
    const status: "completed" | "current" | "locked" =
      completedByStage || completedByTraversal
        ? "completed"
        : enr.activeStageRef === n.stageRef
          ? "current"
          : "locked";
    return {
      id: n.nodeId,
      stageRef: n.stageRef ?? "",
      title: n.title,
      status,
    };
  });

  // Sequence edges: render the graph as a DAG ordered by nodeId so the UI
  // has something to show before the per-stage branch graph lands.
  const edges: Array<{ from: string; to: string }> = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    if (from && to) edges.push({ from: from.id, to: to.id });
  }

  return { nodes, edges };
}
