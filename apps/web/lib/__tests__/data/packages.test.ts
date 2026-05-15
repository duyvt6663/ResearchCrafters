// Unit tests for the catalog and package-overview data projection.
//
// The data layer reads a `PackageVersion.manifest` JSON column and projects
// it onto the `PackageSummary` / `PackageDetail` shapes the UI consumes. We
// mock the Prisma client so the projection logic is exercised against a
// representative manifest without spinning up Postgres.

import { describe, expect, it, vi, beforeEach } from "vitest";

// Hoisted with the vi.mock factory so the mock spies are initialised before
// the data module is imported (vitest hoists vi.mock to the top of the file).
const {
  packageVersionFindMany,
  packageFindUnique,
  packageVersionFindFirst,
} = vi.hoisted(() => ({
  packageVersionFindMany: vi.fn(),
  packageFindUnique: vi.fn(),
  packageVersionFindFirst: vi.fn(),
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: {
    packageVersion: {
      findMany: packageVersionFindMany,
      findFirst: packageVersionFindFirst,
    },
    package: { findUnique: packageFindUnique },
  },
  withQueryTimeout: async <T>(p: PromiseLike<T>): Promise<T> => p,
}));

import {
  getPackageBySlug,
  listPackages,
} from "../../data/packages.js";

const RESNET_PV_ID = "pv-resnet-0_1_0";

const RESNET_MANIFEST = {
  title: "ResNet: Deep Residual Learning for Image Recognition",
  paperTitle: "Deep Residual Learning for Image Recognition",
  oneLinePromise:
    "Reconstruct the ResNet decision tree from evidence.",
  skills: [
    "degradation-problem framing",
    "residual learning intuition",
    "evidence-grounded writing",
  ],
  difficulty: "intermediate",
  estimatedMinutes: 180,
  prerequisites: ["Python", "PyTorch basics", "convolutional neural networks"],
  whatYouWillPractice: [
    "degradation-problem framing",
    "evidence-grounded writing",
  ],
  sampleDecision: {
    prompt: "Which fix do you attack first?",
    branches: [
      {
        label: "Reformulate each block to learn F(x) + x.",
        summary:
          "Restructure the learning target so identity is recoverable at zero cost.",
        type: "canonical",
        revealed: true,
      },
      {
        label: "Adopt 1x1 -> 3x3 -> 1x1 bottleneck without a shortcut.",
        summary:
          "Bottleneck topology saves params but does not fix optimization-side degradation.",
        type: "suboptimal",
        revealed: true,
      },
      {
        label:
          "Keep stacking plain blocks; trust BatchNorm and improved init.",
        summary:
          "BN keeps signal scale alive but the optimizer still cannot find identity.",
        type: "failed",
        revealed: true,
      },
    ],
  },
  failedBranchLesson: {
    title: "Failed branch: keep stacking plain blocks.",
    redactedSummary:
      "Fixing signal scale (BN) is not the same as fixing optimization difficulty.",
  },
  sampleArtifact: {
    kind: "table",
    caption: "Training-curves comparison: plain vs residual at depth 56.",
  },
  pricing: { cta: "waitlist" },
};

beforeEach(() => {
  packageVersionFindMany.mockReset();
  packageFindUnique.mockReset();
  packageVersionFindFirst.mockReset();
});

describe("listPackages", () => {
  it("projects the latest live package version onto the catalog summary", async () => {
    packageVersionFindMany.mockResolvedValue([
      {
        id: RESNET_PV_ID,
        status: "live",
        manifest: RESNET_MANIFEST,
        releaseFreeStageIds: ["S001", "S002"],
        package: { slug: "resnet" },
      },
    ]);

    const summaries = await listPackages();
    expect(summaries).toHaveLength(1);
    const r = summaries[0]!;
    expect(r.slug).toBe("resnet");
    expect(r.title).toBe(RESNET_MANIFEST.title);
    expect(r.paperTitle).toBe(RESNET_MANIFEST.paperTitle);
    expect(r.oneLinePromise).toBe(RESNET_MANIFEST.oneLinePromise);
    expect(r.skills).toEqual(RESNET_MANIFEST.skills);
    expect(r.difficulty).toBe("intermediate");
    expect(r.estimatedMinutes).toBe(180);
    expect(r.freeStageCount).toBe(2);
    expect(r.releaseStatus).toBe("live");
    expect(r.packageVersionId).toBe(RESNET_PV_ID);
  });

  it("collapses multiple live versions of the same slug to the latest row", async () => {
    packageVersionFindMany.mockResolvedValue([
      {
        id: "pv-newer",
        status: "live",
        manifest: { ...RESNET_MANIFEST, title: "Newer ResNet" },
        releaseFreeStageIds: ["S001"],
        package: { slug: "resnet" },
      },
      {
        id: "pv-older",
        status: "live",
        manifest: { ...RESNET_MANIFEST, title: "Older ResNet" },
        releaseFreeStageIds: ["S001", "S002"],
        package: { slug: "resnet" },
      },
    ]);

    const summaries = await listPackages();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.title).toBe("Newer ResNet");
    expect(summaries[0]!.freeStageCount).toBe(1);
  });

  it("returns an empty list when no packages have a live version", async () => {
    packageVersionFindMany.mockResolvedValue([]);
    const summaries = await listPackages();
    expect(summaries).toEqual([]);
  });
});

describe("getPackageBySlug", () => {
  it("returns null for an unknown slug", async () => {
    packageFindUnique.mockResolvedValue(null);
    const result = await getPackageBySlug("does-not-exist");
    expect(result).toBeNull();
  });

  it("returns null when the slug exists but has no live version", async () => {
    packageFindUnique.mockResolvedValue({
      slug: "draft-only",
      versions: [],
    });
    const result = await getPackageBySlug("draft-only");
    expect(result).toBeNull();
  });

  it("projects manifest fields onto the package detail shape and redacts failed-branch summaries", async () => {
    packageFindUnique.mockResolvedValue({
      slug: "resnet",
      versions: [
        {
          id: RESNET_PV_ID,
          status: "live",
          manifest: RESNET_MANIFEST,
          releaseFreeStageIds: ["S001", "S002"],
          stages: [
            {
              stageId: "S001",
              title: "Why is going deeper not enough?",
              type: "writing",
              estimatedTimeMinutes: 10,
              free: true,
            },
            {
              stageId: "S002",
              title: "Which fix do you attack first?",
              type: "decision",
              estimatedTimeMinutes: 15,
              free: true,
            },
            {
              stageId: "S003",
              title: "Implement a residual block.",
              type: "code",
              estimatedTimeMinutes: 30,
              free: false,
            },
          ],
        },
      ],
    });

    const detail = await getPackageBySlug("resnet");
    expect(detail).not.toBeNull();
    if (!detail) return;

    expect(detail.slug).toBe("resnet");
    expect(detail.title).toBe(RESNET_MANIFEST.title);
    expect(detail.skills).toEqual(RESNET_MANIFEST.skills);
    expect(detail.prerequisites).toEqual(RESNET_MANIFEST.prerequisites);
    expect(detail.whatYouWillPractice).toEqual(
      RESNET_MANIFEST.whatYouWillPractice,
    );

    // Stages: free preview is the intersection of `free` and the version's
    // `releaseFreeStageIds`.
    expect(detail.stages).toHaveLength(3);
    expect(detail.stages[0]!.ref).toBe("S001");
    expect(detail.stages[0]!.isFreePreview).toBe(true);
    expect(detail.stages[1]!.ref).toBe("S002");
    expect(detail.stages[1]!.isFreePreview).toBe(true);
    expect(detail.stages[2]!.ref).toBe("S003");
    expect(detail.stages[2]!.isFreePreview).toBe(false);

    // Sample decision: failed branches are redacted at the data layer even
    // if the manifest carries a populated summary.
    expect(detail.sampleDecision.prompt).toBe(
      RESNET_MANIFEST.sampleDecision.prompt,
    );
    const canonical = detail.sampleDecision.branches.find(
      (b) => b.type === "canonical",
    );
    expect(canonical?.revealed).toBe(true);
    expect(canonical?.summary).toContain("Restructure the learning target");

    const failed = detail.sampleDecision.branches.find(
      (b) => b.type === "failed",
    );
    expect(failed).toBeDefined();
    expect(failed?.revealed).toBe(false);
    // The canonical mechanism must not leak through the failed-branch
    // summary on the marketing surface.
    expect(failed?.summary).not.toContain("BatchNorm");
    expect(failed?.summary).not.toContain("optimizer");

    // Failed-branch lesson and pricing pass through.
    expect(detail.failedBranchLesson.title).toBe(
      RESNET_MANIFEST.failedBranchLesson.title,
    );
    expect(detail.pricing.cta).toBe("waitlist");
  });

  it("projects sample-artifact preview data (trajectories and rows) when present", async () => {
    const manifestWithPreview = {
      ...RESNET_MANIFEST,
      sampleArtifact: {
        kind: "plot",
        caption: "Plain vs residual at depth 56.",
        trajectories: [
          {
            name: "plain",
            tone: "plain",
            points: [
              [0, 0.1],
              [80, 0.78],
              [164, 0.885],
            ],
          },
          {
            name: "residual",
            tone: "residual",
            points: [
              [0, 0.1],
              [80, 0.84],
              [164, 0.931],
            ],
          },
          // Malformed entries are dropped silently.
          { name: "", tone: "plain", points: [[0, 0]] },
          { name: "no-points", tone: "plain", points: [] },
          "not-an-object",
        ],
        rows: [
          { label: "test error", values: ["0.115", "0.069"] },
          { label: "missing-values", values: [] },
        ],
        columns: ["plain-56", "residual-56"],
      },
    };

    packageFindUnique.mockResolvedValue({
      slug: "resnet",
      versions: [
        {
          id: RESNET_PV_ID,
          status: "live",
          manifest: manifestWithPreview,
          releaseFreeStageIds: ["S001"],
          stages: [],
        },
      ],
    });

    const detail = await getPackageBySlug("resnet");
    expect(detail).not.toBeNull();
    if (!detail) return;

    expect(detail.sampleArtifact.kind).toBe("plot");
    expect(detail.sampleArtifact.caption).toBe(
      "Plain vs residual at depth 56.",
    );
    expect(detail.sampleArtifact.trajectories).toBeDefined();
    expect(detail.sampleArtifact.trajectories?.length).toBe(2);
    expect(detail.sampleArtifact.trajectories?.[0]?.name).toBe("plain");
    expect(detail.sampleArtifact.trajectories?.[1]?.tone).toBe("residual");
    expect(detail.sampleArtifact.rows?.length).toBe(1);
    expect(detail.sampleArtifact.rows?.[0]?.label).toBe("test error");
    expect(detail.sampleArtifact.columns).toEqual([
      "plain-56",
      "residual-56",
    ]);
  });
});
