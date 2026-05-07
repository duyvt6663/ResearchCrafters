// Stubbed enrollment state. Real shape will be reconciled with
// @researchcrafters/db once the Prisma client is generated.

export type StageInputsMode = "decision" | "writing" | "analysis" | "code" | "experiment" | "reflection" | "review";

export type StageRecord = {
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

const ENROLLMENTS: Record<string, EnrollmentState> = {
  "enr-1": {
    id: "enr-1",
    userId: "u-stub",
    packageSlug: "flash-attention",
    packageVersionId: "flash-attention@1.0.0",
    activeStageRef: "S2-tile",
    unlockedStageRefs: ["S1-framing", "S2-tile"],
    completedStageRefs: ["S1-framing"],
  },
};

const STAGES: Record<string, StageRecord> = {
  "S1-framing": {
    ref: "S1-framing",
    title: "Framing the IO bottleneck",
    type: "decision",
    inputs: {
      mode: "decision",
      prompt:
        "Standard attention spends most wall-clock time on HBM reads. What is the right axis to attack first?",
    },
    isLocked: false,
    isFreePreview: true,
    estimatedMinutes: 8,
    decision: {
      branches: [
        { id: "b1", label: "Reduce FLOPs via approximation", summary: "Trade exactness for fewer ops.", type: "suboptimal", revealed: false },
        { id: "b2", label: "Tile and fuse softmax to keep S in SRAM", summary: "Rework the IO schedule.", type: "canonical", revealed: false },
        { id: "b3", label: "Quantize Q, K, V to int8", summary: "Different problem; precision risk.", type: "failed", revealed: false },
      ],
    },
  },
  "S2-tile": {
    ref: "S2-tile",
    title: "Picking a tile schedule",
    type: "decision",
    inputs: {
      mode: "decision",
      prompt:
        "Given an SRAM budget B, which tile schedule preserves exactness while minimizing HBM reads?",
    },
    isLocked: false,
    isFreePreview: true,
    estimatedMinutes: 10,
    decision: {
      branches: [
        { id: "b1", label: "Block over Q only", summary: "Reads K,V repeatedly.", type: "suboptimal", revealed: false },
        { id: "b2", label: "Block over Q and K, recompute softmax stats", summary: "Fewer HBM reads; needs recompute.", type: "canonical", revealed: false },
        { id: "b3", label: "Materialize full S in HBM", summary: "Defeats the goal.", type: "failed", revealed: false },
      ],
    },
  },
  "S3-kernel": {
    ref: "S3-kernel",
    title: "Implementing the forward kernel",
    type: "code",
    inputs: {
      mode: "code",
      prompt:
        "Implement the FlashAttention forward kernel against the provided harness. Use the CLI to run, test, and submit.",
    },
    isLocked: true,
    isFreePreview: false,
    estimatedMinutes: 60,
    expectedCliMinVersion: "0.3.0",
  },
  "S4-experiment": {
    ref: "S4-experiment",
    title: "Measuring HBM traffic",
    type: "experiment",
    inputs: {
      mode: "experiment",
      prompt:
        "Run the replay harness and record HBM reads vs sequence length. Submit the metrics bundle through the CLI.",
    },
    isLocked: true,
    isFreePreview: false,
    estimatedMinutes: 45,
    expectedCliMinVersion: "0.3.0",
  },
  "S5-writeup": {
    ref: "S5-writeup",
    title: "Writing the evidence narrative",
    type: "writing",
    inputs: {
      mode: "writing",
      prompt:
        "In <=300 words, defend the tile-and-fuse decision using the provided benchmark evidence. Cite at least two artifact refs.",
    },
    isLocked: true,
    isFreePreview: false,
    estimatedMinutes: 25,
    rubric: [
      { id: "r1", label: "Evidence grounding", weight: 0.4 },
      { id: "r2", label: "Causal reasoning", weight: 0.3 },
      { id: "r3", label: "Clarity", weight: 0.3 },
    ],
  },
  "S6-reflection": {
    ref: "S6-reflection",
    title: "Compare to canonical path",
    type: "analysis",
    inputs: {
      mode: "analysis",
      prompt:
        "Inspect the attached HBM-traffic table and explain where your decisions diverged from the canonical path.",
    },
    isLocked: true,
    isFreePreview: false,
    estimatedMinutes: 15,
    artifact: {
      kind: "table",
      caption: "HBM bytes read by tile choice across seq lengths.",
    },
  },
};

export function getEnrollment(id: string): EnrollmentState | undefined {
  return ENROLLMENTS[id];
}

export function getStage(stageRef: string): StageRecord | undefined {
  return STAGES[stageRef];
}

export function getDecisionGraph(enrollmentId: string): {
  nodes: ReadonlyArray<{ id: string; stageRef: string; title: string; status: "current" | "completed" | "locked" }>;
  edges: ReadonlyArray<{ from: string; to: string }>;
} {
  const enr = getEnrollment(enrollmentId);
  if (!enr) return { nodes: [], edges: [] };
  const nodes = Object.values(STAGES).map((s) => ({
    id: s.ref,
    stageRef: s.ref,
    title: s.title,
    status: enr.completedStageRefs.includes(s.ref)
      ? ("completed" as const)
      : enr.activeStageRef === s.ref
        ? ("current" as const)
        : ("locked" as const),
  }));
  const edges: Array<{ from: string; to: string }> = [];
  const refs = nodes.map((n) => n.id);
  for (let i = 0; i < refs.length - 1; i++) {
    const from = refs[i];
    const to = refs[i + 1];
    if (from && to) edges.push({ from, to });
  }
  return { nodes, edges };
}
