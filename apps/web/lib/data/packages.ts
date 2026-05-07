// Stubbed in-memory catalog. Reconciliation note:
// the real shapes will come from `@researchcrafters/erp-schema` and
// `@researchcrafters/content-sdk` once those packages export them. The fields
// here mirror the contract referenced in TODOS/01 and docs/MARKETING.md §11.

export type PackageSummary = {
  slug: string;
  title: string;
  paperTitle: string;
  oneLinePromise: string;
  skills: readonly string[];
  difficulty: "intro" | "intermediate" | "advanced";
  estimatedMinutes: number;
  freeStageCount: number;
  releaseStatus: "alpha" | "beta" | "live";
  enrolled?: boolean;
  progressPct?: number;
};

export type DecisionPreview = {
  prompt: string;
  branches: ReadonlyArray<{
    label: string;
    summary: string;
    type: "canonical" | "suboptimal" | "failed";
    revealed: boolean;
  }>;
};

export type FailedBranchLesson = {
  title: string;
  redactedSummary: string;
};

export type ArtifactPreview = {
  kind: "log" | "table" | "plot";
  caption: string;
};

export type PackageDetail = PackageSummary & {
  prerequisites: readonly string[];
  whatYouWillPractice: readonly string[];
  stages: ReadonlyArray<{
    ref: string;
    title: string;
    type: "decision" | "writing" | "analysis" | "code" | "experiment" | "reflection" | "review";
    estimatedMinutes: number;
    isFreePreview: boolean;
  }>;
  sampleDecision: DecisionPreview;
  failedBranchLesson: FailedBranchLesson;
  sampleArtifact: ArtifactPreview;
  pricing: {
    cta: "buy" | "waitlist";
    monthlyUsd?: number;
  };
};

const FLASH_ATTENTION: PackageDetail = {
  slug: "flash-attention",
  title: "FlashAttention",
  paperTitle: "FlashAttention: Fast and Memory-Efficient Exact Attention",
  oneLinePromise:
    "Rebuild the kernel-level decisions behind exact attention at scale.",
  skills: ["systems", "kernels", "experiment-design"],
  difficulty: "advanced",
  estimatedMinutes: 360,
  freeStageCount: 2,
  releaseStatus: "beta",
  prerequisites: ["linear algebra", "CUDA basics", "PyTorch fluency"],
  whatYouWillPractice: [
    "research framing",
    "implementation",
    "evidence interpretation",
    "research writing",
  ],
  stages: [
    { ref: "S1-framing", title: "Framing the IO bottleneck", type: "decision", estimatedMinutes: 8, isFreePreview: true },
    { ref: "S2-tile", title: "Picking a tile schedule", type: "decision", estimatedMinutes: 10, isFreePreview: true },
    { ref: "S3-kernel", title: "Implementing the forward kernel", type: "code", estimatedMinutes: 60, isFreePreview: false },
    { ref: "S4-experiment", title: "Measuring HBM traffic", type: "experiment", estimatedMinutes: 45, isFreePreview: false },
    { ref: "S5-writeup", title: "Writing the evidence narrative", type: "writing", estimatedMinutes: 25, isFreePreview: false },
    { ref: "S6-reflection", title: "Compare to canonical path", type: "reflection", estimatedMinutes: 15, isFreePreview: false },
  ],
  sampleDecision: {
    prompt:
      "Standard attention spends most wall-clock time on HBM reads. What is the right axis to attack first?",
    branches: [
      {
        label: "Reduce FLOPs via approximation",
        summary: "Trade exactness for fewer ops; risks accuracy regressions.",
        type: "suboptimal",
        revealed: true,
      },
      {
        label: "Tile and fuse softmax to keep S in SRAM",
        summary: "Rework the IO schedule; exact attention preserved.",
        type: "canonical",
        revealed: true,
      },
      {
        label: "Quantize Q, K, V to int8",
        summary: "Lower memory but a different problem; precision risk.",
        type: "failed",
        revealed: false,
      },
    ],
  },
  failedBranchLesson: {
    title: "Why approximation lost",
    redactedSummary:
      "Attempted approximation paths produced [REDACTED] regressions on long-context evals; canonical tile-and-fuse path matched baseline within tolerance.",
  },
  sampleArtifact: {
    kind: "plot",
    caption: "HBM bytes read vs sequence length, baseline vs tiled.",
  },
  pricing: { cta: "buy", monthlyUsd: 29 },
};

const TRANSFORMER: PackageDetail = {
  slug: "attention-is-all-you-need",
  title: "Attention Is All You Need",
  paperTitle: "Attention Is All You Need",
  oneLinePromise:
    "Make the modeling decisions that produced the original Transformer.",
  skills: ["modeling", "research-framing", "writing"],
  difficulty: "intermediate",
  estimatedMinutes: 240,
  freeStageCount: 2,
  releaseStatus: "live",
  prerequisites: ["RNN basics", "softmax intuition"],
  whatYouWillPractice: [
    "research framing",
    "math and implementation",
    "evidence interpretation",
  ],
  stages: [
    { ref: "S1-framing", title: "What replaces recurrence?", type: "decision", estimatedMinutes: 8, isFreePreview: true },
    { ref: "S2-positional", title: "Positional information", type: "decision", estimatedMinutes: 10, isFreePreview: true },
    { ref: "S3-impl", title: "Multi-head attention", type: "code", estimatedMinutes: 50, isFreePreview: false },
    { ref: "S4-write", title: "Writing the ablation summary", type: "writing", estimatedMinutes: 20, isFreePreview: false },
    { ref: "S5-reflection", title: "Decision graph review", type: "reflection", estimatedMinutes: 12, isFreePreview: false },
  ],
  sampleDecision: {
    prompt:
      "Recurrence forces sequential compute. What primitive replaces it without giving up long-range modeling?",
    branches: [
      {
        label: "Scaled dot-product attention",
        summary: "Parallel, exact, and gradient-friendly.",
        type: "canonical",
        revealed: true,
      },
      {
        label: "Wider convolutions only",
        summary: "Local receptive field issue persists at scale.",
        type: "suboptimal",
        revealed: true,
      },
      {
        label: "Memory-augmented RNN",
        summary: "Keeps the sequential bottleneck.",
        type: "failed",
        revealed: false,
      },
    ],
  },
  failedBranchLesson: {
    title: "Why pure-conv lost",
    redactedSummary:
      "Conv-only paths under-modeled long-range dependencies on [REDACTED] tasks; canonical attention path closed the gap.",
  },
  sampleArtifact: {
    kind: "table",
    caption: "BLEU vs depth for attention-only vs conv-only.",
  },
  pricing: { cta: "buy", monthlyUsd: 19 },
};

const PACKAGES: readonly PackageDetail[] = [FLASH_ATTENTION, TRANSFORMER];

export function listPackages(): readonly PackageSummary[] {
  return PACKAGES.map(({ slug, title, paperTitle, oneLinePromise, skills, difficulty, estimatedMinutes, freeStageCount, releaseStatus }) => ({
    slug,
    title,
    paperTitle,
    oneLinePromise,
    skills,
    difficulty,
    estimatedMinutes,
    freeStageCount,
    releaseStatus,
  }));
}

export function getPackageBySlug(slug: string): PackageDetail | undefined {
  return PACKAGES.find((p) => p.slug === slug);
}
