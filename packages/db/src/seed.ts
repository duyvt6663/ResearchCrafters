/**
 * Dev seed for ResearchCrafters.
 *
 * Loads the authored ResNet ERP package via the content SDK, computes a
 * source hash from the build manifest, and mirrors the package + version +
 * stages + decision nodes + branches into Postgres so the catalog,
 * package-overview, and stage routes render real authored content.
 *
 *   loadPackage(content/packages/resnet)
 *     -> User -> Membership -> Package -> PackageVersion (manifest, hash)
 *                                          -> Stage S001..S008
 *                                          -> DecisionNode N001..N008
 *                                          -> Branch (S002 only)
 *           -> Enrollment (pinned to ResNet PackageVersion)
 *
 * Idempotent: re-running upserts on stable slugs/keys.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadPackage,
  buildPackageManifest,
  computeManifestSourceHash,
} from "@researchcrafters/content-sdk";
import type {
  LoadedPackage,
  PackageBuildManifest,
} from "@researchcrafters/content-sdk";

import { prisma } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const RESNET_DIR = path.join(REPO_ROOT, "content", "packages", "resnet");

// The fixture email lives on the @researchcrafters.dev domain so it matches
// the admin allowlist convention used by the auth-db-agent and the planned
// Auth.js admin gate. Do NOT change to fixture@example.com or similar — the
// allowlist treats non-@researchcrafters.dev addresses as unprivileged users
// and the seeded fixture would lose admin scope.
const FIXTURE_USER_EMAIL = "fixture@researchcrafters.dev";
const FIXTURE_PACKAGE_SLUG = "resnet";
// Canonical free stages for the ResNet ERP. The package YAML's release block
// also declares these; we hard-pin here so seeded data does not depend on
// schema-side fields the data layer has not yet picked up.
const RELEASE_FREE_STAGE_IDS = ["S001", "S002"] as const;
const REQUIRES_GPU = false;

// -- Manifest projection helpers ---------------------------------------------

type StageType =
  | "decision"
  | "writing"
  | "analysis"
  | "code"
  | "experiment"
  | "reflection"
  | "review";

/**
 * Map an authored stage `type` (e.g. "framing", "implementation") to the UI
 * stage-type union the catalog and stage player consume.
 */
function uiStageType(authored: string): StageType {
  switch (authored) {
    case "decision":
    case "analysis":
    case "experiment":
    case "reflection":
    case "review":
    case "writing":
      return authored;
    case "framing":
      return "writing";
    case "implementation":
    case "math":
      return "code";
    default:
      return "writing";
  }
}

/**
 * Map an authored input mode (multiple_choice / free_text / code / experiment
 * / mixed) to the runner-mode-leaning execution mode our `Stage.runnerMode`
 * column expects ('test' | 'replay' | 'mini_experiment' | 'none'). Falls
 * through to "none" for non-execution stages.
 */
function runnerModeFor(stagePolicyRunnerMode: string): string {
  switch (stagePolicyRunnerMode) {
    case "test":
    case "replay":
    case "mini_experiment":
    case "none":
      return stagePolicyRunnerMode;
    default:
      return "none";
  }
}

/**
 * Map authored validation kind ("test" | "metric" | "rubric" | "hybrid") to
 * the column shape the data layer mirrors ("tests" | "replay" | "rubric" |
 * "mini_experiment"). The column is not strict; we keep the rubric-vs-tests
 * distinction the canAccess and stage-projection logic expects.
 */
function validationKindFor(kind: string, runner: string): string {
  if (kind === "test") return "tests";
  if (kind === "rubric") return "rubric";
  if (kind === "metric") return "rubric";
  if (kind === "hybrid") {
    return runner === "replay" ? "replay" : "tests";
  }
  return "rubric";
}

/**
 * Difficulty values come from the authored YAML enum
 * (very_easy/easy/medium/hard) but the data layer surfaces a coarser
 * (intro/intermediate/advanced) bucket on the package summary. We mirror the
 * authored value on the stage row and let `packages.ts` derive the bucketed
 * version for the package summary card.
 */
function bucketDifficulty(value: string): "intro" | "intermediate" | "advanced" {
  switch (value) {
    case "very_easy":
    case "easy":
      return "intro";
    case "medium":
    case "intermediate":
      return "intermediate";
    case "hard":
    case "advanced":
      return "advanced";
    default:
      return "intermediate";
  }
}

/**
 * Build the sample-decision UI payload for the marketing surface from S002.
 * The first decision-type stage with branches is treated as the canonical
 * sample. Failed branches stay hidden (revealed=false) and their summary is
 * redacted to a non-spoiler line so the public package overview cannot leak
 * the canonical answer.
 */
function buildSampleDecision(
  loaded: LoadedPackage,
): {
  prompt: string;
  branches: Array<{
    label: string;
    summary: string;
    type: "canonical" | "suboptimal" | "failed";
    revealed: boolean;
  }>;
} {
  const decisionStage =
    loaded.stages.find((s) => s.data.type === "decision") ??
    loaded.stages.find((s) => s.data.id === "S002") ??
    loaded.stages[0];
  if (!decisionStage) return { prompt: "", branches: [] };

  // Find all branches whose graph node points at this stage. The build
  // manifest stage-id is the YAML id ("S002"); graph nodes carry the same
  // id under stageRef.
  const node = loaded.graph.nodes.find((n) => {
    const stageRef = n.stage;
    return (
      stageRef.endsWith(`${decisionStage.data.id}.yaml`) ||
      stageRef === decisionStage.data.id ||
      stageRef === decisionStage.ref
    );
  });
  const branchIds = new Set(
    (node?.choices ?? []).map((c) => {
      // c.branch is a path like 'branches/branch-residual-canonical.yaml';
      // resolve back to the branch.id which loader stores under data.id.
      const last = c.branch.split("/").pop() ?? c.branch;
      return last.replace(/\.ya?ml$/i, "");
    }),
  );

  const matched = loaded.branches.filter((b) =>
    branchIds.size === 0 ? true : branchIds.has(b.data.id),
  );

  return {
    prompt: decisionStage.data.task.prompt_md.trim(),
    branches: matched.map((b) => {
      const isFailed = b.data.type === "failed";
      return {
        label: b.data.choice,
        // Failed branches: redact to the "lesson" gist and never reveal the
        // canonical mechanism. Canonical and suboptimal branches show the
        // authored lesson on the marketing surface.
        summary: isFailed
          ? `(hidden — completed-stage lesson)`
          : b.data.lesson.trim().split("\n")[0] ?? b.data.lesson.trim(),
        type:
          b.data.type === "canonical" ||
          b.data.type === "suboptimal" ||
          b.data.type === "failed"
            ? b.data.type
            : "suboptimal",
        revealed: !isFailed,
      };
    }),
  };
}

function buildFailedBranchLesson(loaded: LoadedPackage): {
  title: string;
  redactedSummary: string;
} {
  const failed = loaded.branches.find((b) => b.data.type === "failed");
  if (!failed) {
    return { title: "", redactedSummary: "" };
  }
  return {
    // Catalog spoiler boundary: never bake the failed-branch CHOICE into
    // the title. The choice text IS the wrong-but-plausible answer the
    // package wants the learner to consider unaided. The non-spoiler title
    // promises a lesson without revealing which path it critiques.
    title: "What a tempting wrong path here taught us",
    // The redactedSummary is a high-level lesson — already non-spoiler in
    // the authored content (`branch.lesson` does not name the canonical
    // mechanism by design). Surface as authored.
    redactedSummary: failed.data.lesson.trim(),
  };
}

type ArtifactPreviewTrajectory = {
  name: string;
  tone: "plain" | "residual";
  points: Array<[number, number]>;
};

type ArtifactPreviewRow = {
  label: string;
  values: string[];
};

type SampleArtifact = {
  kind: "log" | "table" | "plot";
  caption: string;
  trajectories?: ArtifactPreviewTrajectory[];
  rows?: ArtifactPreviewRow[];
  columns?: string[];
};

function buildSampleArtifact(loaded: LoadedPackage): SampleArtifact {
  // Prefer an inline preview-fidelity training curve when the package has
  // a tabular evidence artifact — the curve communicates the comparison
  // visually and lands as a real preview rather than a placeholder.
  const tables = loaded.artifact.evidencePaths.find((p) =>
    p.toLowerCase().includes("table"),
  );
  if (tables) {
    return {
      kind: "plot",
      caption: `Training-curves comparison from ${tables.split("/").pop()}.`,
      // Illustrative trajectories shaped from the authored
      // `training-curves.md` table (plain vs residual, error -> accuracy).
      // Point counts kept small so the inline SVG stays crisp at the
      // sidebar width.
      trajectories: [
        {
          name: "plain",
          tone: "plain",
          points: [
            [0, 0.1],
            [40, 0.55],
            [80, 0.78],
            [120, 0.86],
            [164, 0.885],
          ],
        },
        {
          name: "residual",
          tone: "residual",
          points: [
            [0, 0.1],
            [40, 0.62],
            [80, 0.84],
            [120, 0.91],
            [164, 0.931],
          ],
        },
      ],
    };
  }
  if (loaded.artifact.evidencePaths.length > 0) {
    return {
      kind: "log",
      caption: `Authored evidence at ${loaded.artifact.evidencePaths[0]}.`,
    };
  }
  return { kind: "log", caption: "Authored evidence preview." };
}

/**
 * Compose the manifest JSON we store on `PackageVersion.manifest`. The data
 * layer reads UI-projection fields directly off this column (oneLinePromise,
 * sampleDecision, etc.); the canonical build manifest is stored under
 * `build` for downstream consumers (validator, CLI) that want the structured
 * graph/stage/branch tables.
 */
function buildStoredManifest(
  loaded: LoadedPackage,
  build: PackageBuildManifest,
): Record<string, unknown> {
  // Promise copy: prefer the package title's natural-language continuation;
  // fall back to a derived line. The authored YAML doesn't carry a one-line
  // marketing promise yet, so we synthesize one from the paper title and
  // package skills.
  const oneLinePromise =
    loaded.package.title.includes(":")
      ? loaded.package.title.split(":").slice(1).join(":").trim()
      : `Reconstruct the ${loaded.package.paper.title} decision tree from evidence.`;

  return {
    title: loaded.package.title,
    paperTitle: loaded.package.paper.title,
    oneLinePromise,
    skills: loaded.package.skills,
    difficulty: bucketDifficulty(loaded.package.difficulty),
    estimatedMinutes: loaded.package.estimated_time_minutes,
    prerequisites: loaded.package.prerequisites,
    // Authored YAML doesn't carry a marketing "what you will practice" list;
    // mirror the skills which serve the same purpose on the overview page.
    whatYouWillPractice: loaded.package.skills,
    sampleDecision: buildSampleDecision(loaded),
    failedBranchLesson: buildFailedBranchLesson(loaded),
    sampleArtifact: buildSampleArtifact(loaded),
    pricing: { cta: "waitlist" as const },
    // Embed the canonical build manifest so callers that need stage/graph
    // metadata don't have to re-read the package YAML.
    build,
  };
}

// -- Seed entry point --------------------------------------------------------

async function main(): Promise<void> {
  const loaded = await loadPackage(RESNET_DIR);
  const build = buildPackageManifest(loaded);
  const manifest = buildStoredManifest(loaded, build);
  // Use the shared content-sdk helper so the hash matches the one written
  // alongside `manifest.json` by `researchcrafters build`.
  const sourceHash = computeManifestSourceHash(build);

  const user = await prisma.user.upsert({
    where: { email: FIXTURE_USER_EMAIL },
    update: {},
    create: {
      email: FIXTURE_USER_EMAIL,
      githubHandle: "fixture",
      displayName: "Fixture Learner",
      name: "Fixture Learner",
      image: null,
      emailVerified: new Date(),
    },
  });

  // Auth.js fixture: a fake GitHub OAuth account so dev can log in via the
  // database-session strategy without the real GitHub provider configured.
  const FIXTURE_PROVIDER_ACCOUNT_ID = "fixture-github-id";
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "github",
        providerAccountId: FIXTURE_PROVIDER_ACCOUNT_ID,
      },
    },
    select: { id: true },
  });
  if (!existingAccount) {
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider: "github",
        providerAccountId: FIXTURE_PROVIDER_ACCOUNT_ID,
        token_type: "bearer",
        scope: "read:user user:email",
      },
    });
  }

  // Auth.js fixture: an active session row so dev tooling can sign in by
  // setting the session cookie directly. Idempotent on the stable token.
  const FIXTURE_SESSION_TOKEN = "fixture-session-token";
  const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.upsert({
    where: { sessionToken: FIXTURE_SESSION_TOKEN },
    update: { expires: sessionExpires },
    create: {
      sessionToken: FIXTURE_SESSION_TOKEN,
      userId: user.id,
      expires: sessionExpires,
    },
  });

  // One membership for the fixture user. Plan = pro so policy paths that
  // gate on entitlement are exercised by default.
  const existingMembership = await prisma.membership.findFirst({
    where: { userId: user.id },
  });
  const membership =
    existingMembership ??
    (await prisma.membership.create({
      data: {
        userId: user.id,
        plan: "pro",
        status: "active",
      },
    }));

  // ResNet package + version. Pin to the loaded package's version (0.1.0)
  // and the computed source hash so re-running the seed against the same
  // authored package is a no-op.
  const pkg = await prisma.package.upsert({
    where: { slug: FIXTURE_PACKAGE_SLUG },
    update: {},
    create: { slug: FIXTURE_PACKAGE_SLUG },
  });

  const packageVersion = await prisma.packageVersion.upsert({
    where: {
      packageId_version: {
        packageId: pkg.id,
        version: loaded.package.version,
      },
    },
    update: {
      // Re-running with edited package YAML refreshes the manifest+hash but
      // keeps stable id and createdAt.
      status: "live",
      sourceHash,
      manifest: manifest as object,
      releaseFreeStageIds: [...RELEASE_FREE_STAGE_IDS],
      requiresGpu: REQUIRES_GPU,
    },
    create: {
      packageId: pkg.id,
      version: loaded.package.version,
      status: "live",
      sourceHash,
      manifest: manifest as object,
      releaseFreeStageIds: [...RELEASE_FREE_STAGE_IDS],
      requiresGpu: REQUIRES_GPU,
    },
  });

  // Stages: one Stage row per authored stage YAML, mirrored under the
  // pinned package version. The composite unique key (packageVersionId,
  // stageId) makes upsert idempotent.
  //
  // We extend the authored stage_policy with the stage prompt and the
  // declared inputs.mode so the data layer (`lib/data/enrollment.ts`) can
  // resolve the inputs payload off a single Json column without reading
  // back into the package YAML.
  const stagePolicyByStageId = new Map<string, Record<string, unknown>>(
    loaded.stages.map((s) => {
      const policy = s.data.stage_policy as Record<string, unknown>;
      return [
        s.data.id,
        {
          ...policy,
          artifact_refs: s.data.artifact_refs,
          source_refs: s.data.source_refs ?? [],
          evidence_refs: s.data.evidence_refs ?? [],
          ...(s.data.stage_subtype !== undefined
            ? { stage_subtype: s.data.stage_subtype }
            : {}),
          ...(s.data.writing_constraints !== undefined
            ? { writing_constraints: s.data.writing_constraints }
            : {}),
          ...(s.data.citation_policy !== undefined
            ? { citation_policy: s.data.citation_policy }
            : {}),
          ...(s.data.reviewer_prompt !== undefined
            ? { reviewer_prompt: s.data.reviewer_prompt }
            : {}),
          ...(s.data.revision !== undefined
            ? { revision: s.data.revision }
            : {}),
          prompt: s.data.task.prompt_md.trim(),
          task: { prompt: s.data.task.prompt_md.trim() },
        },
      ];
    }),
  );

  for (const buildStage of build.stages) {
    const policy = stagePolicyByStageId.get(buildStage.id);
    const isFree = RELEASE_FREE_STAGE_IDS.includes(
      buildStage.id as (typeof RELEASE_FREE_STAGE_IDS)[number],
    );
    const runnerMode = runnerModeFor(buildStage.runnerMode);
    const validationKind = validationKindFor(
      buildStage.validationKind,
      runnerMode,
    );
    const stageData = {
      packageVersionId: packageVersion.id,
      stageId: buildStage.id,
      title: buildStage.title,
      // Use the UI-friendly stage type (writing/code/...) on the column so
      // `lib/data/enrollment.ts` can branch off it directly.
      type: uiStageType(buildStage.type),
      difficulty: buildStage.difficulty,
      estimatedTimeMinutes: buildStage.estimatedMinutes,
      validationKind,
      runnerMode,
      rubricRef: buildStage.rubricRef ?? null,
      stagePolicy: (policy ?? {}) as object,
      passThreshold: buildStage.passThreshold ?? null,
      free: isFree,
    };
    await prisma.stage.upsert({
      where: {
        packageVersionId_stageId: {
          packageVersionId: packageVersion.id,
          stageId: buildStage.id,
        },
      },
      update: stageData,
      create: stageData,
    });
  }

  // DecisionNodes: one node per graph entry. The node's `stageRef` is the
  // YAML stage id (S00x) so traversal queries can join Stage <-> Node.
  const stageIdByPath = new Map<string, string>(
    loaded.stages.map((s) => [s.ref, s.data.id]),
  );

  for (const node of build.graphNodes) {
    const stageRef =
      // Prefer the resolved ref from the build (handles both basename and
      // full-path graph stage references).
      (node.stageRef && stageIdByPath.get(node.stageRef)) ??
      // Fall back to scanning loaded stages by id; graph.yaml may reference
      // by id or by relative path depending on author style.
      loaded.stages.find((s) => node.stagePath.endsWith(`${s.data.id}.yaml`))
        ?.data.id ??
      null;

    await prisma.decisionNode.upsert({
      where: {
        packageVersionId_nodeId: {
          packageVersionId: packageVersion.id,
          nodeId: node.id,
        },
      },
      update: {
        title: node.title,
        type: node.type,
        stageRef,
      },
      create: {
        packageVersionId: packageVersion.id,
        nodeId: node.id,
        title: node.title,
        type: node.type,
        stageRef,
      },
    });
  }

  // Branches: link each authored branch to the decision node it belongs to.
  // The graph's `choices[].branchRef` carries the branch path; strip to the
  // branch id (file basename without .yaml).
  const decisionNodeIdByNodeId = new Map<string, string>();
  const allNodes = await prisma.decisionNode.findMany({
    where: { packageVersionId: packageVersion.id },
    select: { id: true, nodeId: true },
  });
  for (const n of allNodes) decisionNodeIdByNodeId.set(n.nodeId, n.id);

  // Map authored branchId -> graph nodeId via the graph's choices block.
  const nodeIdByBranchId = new Map<string, string>();
  for (const node of build.graphNodes) {
    for (const choice of node.choices) {
      const last = choice.branchRef.split("/").pop() ?? choice.branchRef;
      const branchId = last.replace(/\.ya?ml$/i, "");
      nodeIdByBranchId.set(branchId, node.id);
    }
  }

  for (const branch of build.branches) {
    const owningNodeId = nodeIdByBranchId.get(branch.id) ?? null;
    const decisionNodeId = owningNodeId
      ? (decisionNodeIdByNodeId.get(owningNodeId) ?? null)
      : null;

    const branchData = {
      packageVersionId: packageVersion.id,
      decisionNodeId,
      branchId: branch.id,
      type: branch.type,
      // The build manifest exposes the support level enum
      // ('explicit'|'inferred'|'expert_reconstructed'); the DB column expects
      // 'supported'|'partially_supported'|'unsupported'. We map conservatively
      // so the schema's allowed-values comment is honoured.
      supportLevel:
        branch.supportLevel === "explicit"
          ? "supported"
          : branch.supportLevel === "inferred"
            ? "partially_supported"
            : "unsupported",
      choice: branch.choice,
      evidenceRefs: branch.evidenceRefs as object,
      sourceRefs: branch.sourceRefs as object,
      lesson:
        loaded.branches.find((b) => b.data.id === branch.id)?.data.lesson ??
        branch.choice,
      // Decision-stage feedback visibility comes from the owning stage
      // policy. We default to the canonical "after_attempt" gate; the data
      // layer applies its own canAccess checks before revealing branches.
      gatedFeedbackVisibility: "after_attempt",
    };

    await prisma.branch.upsert({
      where: {
        packageVersionId_branchId: {
          packageVersionId: packageVersion.id,
          branchId: branch.id,
        },
      },
      update: branchData,
      create: branchData,
    });
  }

  // Fixture enrollment: pin to the (idempotent) ResNet PackageVersion. If
  // the user already has an enrollment for this version we leave it alone;
  // any prior enrollment pinned to a different (deprecated) fixture
  // package is removed so re-runs converge on a clean state.
  await prisma.enrollment.deleteMany({
    where: {
      userId: user.id,
      packageVersion: { package: { slug: { not: FIXTURE_PACKAGE_SLUG } } },
    },
  });

  const existingEnrollment = await prisma.enrollment.findFirst({
    where: { userId: user.id, packageVersionId: packageVersion.id },
  });
  const firstStageId = build.stages[0]?.id ?? "S001";
  const enrollment =
    existingEnrollment ??
    (await prisma.enrollment.create({
      data: {
        userId: user.id,
        packageVersionId: packageVersion.id,
        activeStageRef: firstStageId,
        completedStageRefs: [],
        unlockedNodeRefs: build.graphNodes
          .slice(0, 1)
          .map((n) => n.id) as object,
        status: "active",
      },
    }));

   
  console.log(
    `seeded ${FIXTURE_PACKAGE_SLUG}@${loaded.package.version} with ` +
      `${build.stages.length} stages, ${build.branches.length} branches, ` +
      `1 enrollment`,
  );
   
  console.log("Seed details", {
    userId: user.id,
    membershipId: membership.id,
    packageId: pkg.id,
    packageVersionId: packageVersion.id,
    sourceHash,
    enrollmentId: enrollment.id,
  });
}

main()
  .catch((err: unknown) => {
     
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
