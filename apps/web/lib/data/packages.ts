// Catalog data layer. Reads packages and their latest live version from
// Postgres via Prisma and projects them to the lightweight UI shapes the
// page components consume.
//
// The shapes (`PackageSummary`, `PackageDetail`) are kept as the contract
// against the existing UI components — extending fields here is fine, but
// renaming or removing a field is a breaking change for the component layer.

import { prisma, withQueryTimeout } from "@researchcrafters/db";

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
  packageVersionId?: string;
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

export type ArtifactPreviewTrajectory = {
  name: string;
  tone: "plain" | "residual";
  points: ReadonlyArray<readonly [number, number]>;
};

export type ArtifactPreviewRow = {
  label: string;
  values: ReadonlyArray<string>;
};

export type ArtifactPreview = {
  kind: "log" | "table" | "plot";
  caption: string;
  /** Optional inline preview data — when present, the page renders the
   *  authored artifact instead of a hardcoded illustration. */
  trajectories?: ReadonlyArray<ArtifactPreviewTrajectory>;
  rows?: ReadonlyArray<ArtifactPreviewRow>;
  columns?: ReadonlyArray<string>;
};

export type PackageStageSummary = {
  ref: string;
  title: string;
  type: "decision" | "writing" | "analysis" | "code" | "experiment" | "reflection" | "review";
  estimatedMinutes: number;
  isFreePreview: boolean;
};

export type PackageDetail = PackageSummary & {
  prerequisites: readonly string[];
  whatYouWillPractice: readonly string[];
  stages: ReadonlyArray<PackageStageSummary>;
  sampleDecision: DecisionPreview;
  failedBranchLesson: FailedBranchLesson;
  sampleArtifact: ArtifactPreview;
  pricing: {
    cta: "buy" | "waitlist";
    monthlyUsd?: number;
  };
};

// `manifest` is a free-form JSON column mirrored from the package YAML at
// publish time. We pull common keys with a permissive shape so the projection
// doesn't crash when older packages are missing fields.
type ManifestShape = {
  title?: unknown;
  paperTitle?: unknown;
  paper_title?: unknown;
  oneLinePromise?: unknown;
  one_line_promise?: unknown;
  skills?: unknown;
  difficulty?: unknown;
  estimatedMinutes?: unknown;
  estimated_minutes?: unknown;
  prerequisites?: unknown;
  whatYouWillPractice?: unknown;
  what_you_will_practice?: unknown;
  sampleDecision?: unknown;
  sample_decision?: unknown;
  failedBranchLesson?: unknown;
  failed_branch_lesson?: unknown;
  sampleArtifact?: unknown;
  sample_artifact?: unknown;
  pricing?: unknown;
};

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asDifficulty(
  value: unknown,
): "intro" | "intermediate" | "advanced" {
  if (value === "intro" || value === "intermediate" || value === "advanced") {
    return value;
  }
  return "intermediate";
}

function asReleaseStatus(value: string): "alpha" | "beta" | "live" {
  if (value === "alpha" || value === "beta" || value === "live") return value;
  // `archived` and any future statuses fall back to the safest public-facing
  // label so the UI doesn't render "archived" packages as available.
  return "live";
}

function projectSummary(args: {
  slug: string;
  packageVersionId: string;
  manifest: ManifestShape;
  status: string;
  freeStageCount: number;
}): PackageSummary {
  const m = args.manifest;
  return {
    slug: args.slug,
    title: asString(m.title, args.slug),
    paperTitle: asString(m.paperTitle ?? m.paper_title, ""),
    oneLinePromise: asString(m.oneLinePromise ?? m.one_line_promise, ""),
    skills: asStringArray(m.skills),
    difficulty: asDifficulty(m.difficulty),
    estimatedMinutes: asNumber(
      m.estimatedMinutes ?? m.estimated_minutes,
      0,
    ),
    freeStageCount: args.freeStageCount,
    releaseStatus: asReleaseStatus(args.status),
    packageVersionId: args.packageVersionId,
  };
}

function asStageType(value: string): PackageStageSummary["type"] {
  switch (value) {
    case "decision":
    case "writing":
    case "analysis":
    case "code":
    case "experiment":
    case "reflection":
    case "review":
      return value;
    case "lesson":
      return "writing";
    case "lab":
      return "code";
    default:
      return "writing";
  }
}

/**
 * List all packages joined with their latest live `PackageVersion`.
 * Packages without a live version are omitted. Packages are ordered by
 * earliest creation so the catalog is stable across reloads.
 */
export async function listPackages(): Promise<readonly PackageSummary[]> {
  const versions = await withQueryTimeout(
    prisma.packageVersion.findMany({
      where: { status: "live" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        manifest: true,
        releaseFreeStageIds: true,
        package: { select: { slug: true } },
      },
    }),
  );

  // Reduce to one row per package (latest live version wins).
  const bySlug = new Map<string, (typeof versions)[number]>();
  for (const v of versions) {
    if (!bySlug.has(v.package.slug)) {
      bySlug.set(v.package.slug, v);
    }
  }

  return Array.from(bySlug.values()).map((v) =>
    projectSummary({
      slug: v.package.slug,
      packageVersionId: v.id,
      manifest: (v.manifest ?? {}) as ManifestShape,
      status: v.status,
      freeStageCount: v.releaseFreeStageIds.length,
    }),
  );
}

/**
 * Look up a single package by slug and return the full detail shape used by
 * the package overview page. Returns `null` when the slug is unknown or has
 * no live version. Stages are taken from the latest live `PackageVersion`.
 */
export async function getPackageBySlug(
  slug: string,
): Promise<PackageDetail | null> {
  const pkg = await withQueryTimeout(
    prisma.package.findUnique({
      where: { slug },
      select: {
        slug: true,
        versions: {
          where: { status: "live" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            manifest: true,
            releaseFreeStageIds: true,
            stages: {
              orderBy: { stageId: "asc" },
              select: {
                stageId: true,
                title: true,
                type: true,
                estimatedTimeMinutes: true,
                free: true,
              },
            },
          },
        },
      },
    }),
  );

  const version = pkg?.versions[0];
  if (!pkg || !version) return null;

  const manifest = (version.manifest ?? {}) as ManifestShape;
  const summary = projectSummary({
    slug: pkg.slug,
    packageVersionId: version.id,
    manifest,
    status: version.status,
    freeStageCount: version.releaseFreeStageIds.length,
  });

  // Stages: project Prisma rows to the UI shape. `isFreePreview` is the
  // intersection of `Stage.free` and the version's `releaseFreeStageIds`,
  // matching the canAccess policy.
  const stages: PackageStageSummary[] = version.stages.map((s) => ({
    ref: s.stageId,
    title: s.title,
    type: asStageType(s.type),
    estimatedMinutes: s.estimatedTimeMinutes,
    isFreePreview:
      s.free && version.releaseFreeStageIds.includes(s.stageId),
  }));

  // Optional manifest sub-objects: keep the same loose shape they had in the
  // stub. Pages tolerate missing sample-decision / failed-branch / artifact
  // fields by rendering empty placeholders.
  //
  // Sample-decision: failed branches have their canonical content redacted
  // here (defense in depth) so the public package overview cannot leak the
  // canonical mechanism even if the manifest contains it. The page layer
  // additionally hides failed branches from the marketing surface.
  const sampleDecision = redactSampleDecision(
    readDecisionPreview(
      manifest.sampleDecision ?? manifest.sample_decision,
    ),
  );
  const failedBranchLesson = readFailedBranchLesson(
    manifest.failedBranchLesson ?? manifest.failed_branch_lesson,
  );
  const sampleArtifact = readArtifactPreview(
    manifest.sampleArtifact ?? manifest.sample_artifact,
  );
  const pricing = readPricing(manifest.pricing);

  return {
    ...summary,
    prerequisites: asStringArray(manifest.prerequisites),
    whatYouWillPractice: asStringArray(
      manifest.whatYouWillPractice ?? manifest.what_you_will_practice,
    ),
    stages,
    sampleDecision,
    failedBranchLesson,
    sampleArtifact,
    pricing,
  };
}

/**
 * Apply branch-policy redaction to a sample-decision payload before it
 * reaches the marketing surface. Failed branches are kept (so the UI can
 * choose to show "hidden until completion") but their `summary` is
 * stripped to a non-spoiler placeholder and `revealed` is forced to false.
 * Canonical and suboptimal branches are surfaced as authored.
 */
/**
 * Failed-branch redaction is the catalog's spoiler boundary. The previous
 * pass only redacted `summary`, but the original `label` IS the failed
 * choice description (e.g. "Just keep stacking plain blocks; trust
 * BatchNorm to handle depth") — exposing it pre-completion still leaks
 * the wrong-but-plausible answer the package wants the learner to consider
 * on their own. Replace BOTH fields with non-spoiler placeholders for
 * `failed` branches, and force `revealed: false`. Canonical and suboptimal
 * branches surface as authored — those are the answers the catalog wants
 * to advertise.
 */
function redactSampleDecision(decision: DecisionPreview): DecisionPreview {
  return {
    prompt: decision.prompt,
    branches: decision.branches.map((b) =>
      b.type === "failed"
        ? {
            label: "Hidden until completion",
            summary: "(hidden — completed-stage lesson)",
            type: "failed",
            revealed: false,
          }
        : b,
    ),
  };
}

function readDecisionPreview(value: unknown): DecisionPreview {
  if (!value || typeof value !== "object") {
    return { prompt: "", branches: [] };
  }
  const v = value as { prompt?: unknown; branches?: unknown };
  const branches = Array.isArray(v.branches)
    ? v.branches
        .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null)
        .map((b) => ({
          label: asString(b["label"], ""),
          summary: asString(b["summary"], ""),
          type: asBranchType(b["type"]),
          revealed: typeof b["revealed"] === "boolean" ? b["revealed"] : false,
        }))
    : [];
  return { prompt: asString(v.prompt, ""), branches };
}

function asBranchType(
  value: unknown,
): "canonical" | "suboptimal" | "failed" {
  if (value === "canonical" || value === "suboptimal" || value === "failed") {
    return value;
  }
  return "suboptimal";
}

function readFailedBranchLesson(value: unknown): FailedBranchLesson {
  if (!value || typeof value !== "object") {
    return { title: "", redactedSummary: "" };
  }
  const v = value as { title?: unknown; redactedSummary?: unknown; redacted_summary?: unknown };
  return {
    title: asString(v.title, ""),
    redactedSummary: asString(v.redactedSummary ?? v.redacted_summary, ""),
  };
}

function readArtifactPreview(value: unknown): ArtifactPreview {
  if (!value || typeof value !== "object") {
    return { kind: "log", caption: "" };
  }
  const v = value as {
    kind?: unknown;
    caption?: unknown;
    trajectories?: unknown;
    rows?: unknown;
    columns?: unknown;
  };
  const kind = v.kind === "log" || v.kind === "table" || v.kind === "plot" ? v.kind : "log";
  const preview: ArtifactPreview = {
    kind,
    caption: asString(v.caption, ""),
  };
  const trajectories = readTrajectories(v.trajectories);
  if (trajectories.length > 0) preview.trajectories = trajectories;
  const rows = readRows(v.rows);
  if (rows.length > 0) preview.rows = rows;
  const columns = asStringArray(v.columns);
  if (columns.length > 0) preview.columns = columns;
  return preview;
}

function readTrajectories(value: unknown): readonly ArtifactPreviewTrajectory[] {
  if (!Array.isArray(value)) return [];
  const out: ArtifactPreviewTrajectory[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { name?: unknown; tone?: unknown; points?: unknown };
    const name = asString(r.name, "");
    const tone = r.tone === "residual" ? "residual" : "plain";
    if (!Array.isArray(r.points)) continue;
    const points: Array<readonly [number, number]> = [];
    for (const p of r.points) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const x = p[0];
      const y = p[1];
      if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
        points.push([x, y] as const);
      }
    }
    if (name && points.length > 0) {
      out.push({ name, tone, points });
    }
  }
  return out;
}

function readRows(value: unknown): readonly ArtifactPreviewRow[] {
  if (!Array.isArray(value)) return [];
  const out: ArtifactPreviewRow[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { label?: unknown; values?: unknown };
    const label = asString(r.label, "");
    const values = asStringArray(r.values);
    if (label && values.length > 0) {
      out.push({ label, values });
    }
  }
  return out;
}

function readPricing(value: unknown): PackageDetail["pricing"] {
  if (!value || typeof value !== "object") {
    return { cta: "waitlist" };
  }
  const v = value as { cta?: unknown; monthlyUsd?: unknown; monthly_usd?: unknown };
  const cta = v.cta === "buy" ? "buy" : "waitlist";
  const monthly = asNumber(v.monthlyUsd ?? v.monthly_usd, NaN);
  if (cta === "buy" && Number.isFinite(monthly)) {
    return { cta, monthlyUsd: monthly };
  }
  return { cta };
}

/**
 * Resolve a slug to its latest live `PackageVersion.id`. Used by routes that
 * need to pin actions (enroll, mentor, etc.) to a specific version without
 * loading the whole detail payload.
 */
export async function getLatestLivePackageVersionId(
  slug: string,
): Promise<string | null> {
  const version = await withQueryTimeout(
    prisma.packageVersion.findFirst({
      where: { status: "live", package: { slug } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  );
  return version?.id ?? null;
}
