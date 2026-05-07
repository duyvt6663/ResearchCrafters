/**
 * Dev seed for ResearchCrafters.
 *
 * Creates a single coherent fixture chain so a fresh local DB has enough
 * data to render the catalog, enrollment, and stage pages end-to-end:
 *
 *   User -> Membership -> Package -> PackageVersion
 *                                  -> Stage S001, Stage S002
 *                                  -> DecisionNode N001 -> Branch B001, B002
 *        -> Enrollment (pinned to PackageVersion)
 *
 * Idempotent: re-running upserts on stable slugs/keys.
 */

import { prisma } from "./client.js";

const FIXTURE_USER_EMAIL = "fixture@researchcrafters.dev";
const FIXTURE_PACKAGE_SLUG = "flash-attention";
const FIXTURE_PACKAGE_VERSION = "0.1.0";

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: FIXTURE_USER_EMAIL },
    update: {},
    create: {
      email: FIXTURE_USER_EMAIL,
      githubHandle: "fixture",
      displayName: "Fixture Learner",
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

  const pkg = await prisma.package.upsert({
    where: { slug: FIXTURE_PACKAGE_SLUG },
    update: {},
    create: { slug: FIXTURE_PACKAGE_SLUG },
  });

  const packageVersion = await prisma.packageVersion.upsert({
    where: {
      packageId_version: {
        packageId: pkg.id,
        version: FIXTURE_PACKAGE_VERSION,
      },
    },
    update: {},
    create: {
      packageId: pkg.id,
      version: FIXTURE_PACKAGE_VERSION,
      status: "live",
      sourceHash: "sha256:fixture-source-hash",
      manifest: {
        title: "Flash Attention",
        summary: "Fixture package version for local development.",
      },
      releaseFreeStageIds: ["S001"],
      requiresGpu: false,
    },
  });

  const stage1 = await prisma.stage.upsert({
    where: {
      packageVersionId_stageId: {
        packageVersionId: packageVersion.id,
        stageId: "S001",
      },
    },
    update: {},
    create: {
      packageVersionId: packageVersion.id,
      stageId: "S001",
      title: "Read the paper",
      type: "lesson",
      difficulty: "easy",
      estimatedTimeMinutes: 30,
      validationKind: "rubric",
      runnerMode: "none",
      stagePolicy: { entitlementGates: [], shareCardEligible: false },
      free: true,
    },
  });

  const stage2 = await prisma.stage.upsert({
    where: {
      packageVersionId_stageId: {
        packageVersionId: packageVersion.id,
        stageId: "S002",
      },
    },
    update: {},
    create: {
      packageVersionId: packageVersion.id,
      stageId: "S002",
      title: "Implement scaled dot-product attention",
      type: "lab",
      difficulty: "medium",
      estimatedTimeMinutes: 90,
      validationKind: "tests",
      runnerMode: "test",
      passThreshold: 0.8,
      stagePolicy: { entitlementGates: ["membership"], shareCardEligible: true },
      free: false,
    },
  });

  const decisionNode = await prisma.decisionNode.upsert({
    where: {
      packageVersionId_nodeId: {
        packageVersionId: packageVersion.id,
        nodeId: "N001",
      },
    },
    update: {},
    create: {
      packageVersionId: packageVersion.id,
      nodeId: "N001",
      title: "Pick a softmax strategy",
      type: "choice",
      stageRef: stage2.stageId,
    },
  });

  await prisma.branch.upsert({
    where: {
      packageVersionId_branchId: {
        packageVersionId: packageVersion.id,
        branchId: "B001",
      },
    },
    update: {},
    create: {
      packageVersionId: packageVersion.id,
      decisionNodeId: decisionNode.id,
      branchId: "B001",
      type: "canonical",
      supportLevel: "supported",
      choice: "Online softmax with running max",
      evidenceRefs: [{ ref: "artifact/PAPER.md#sec-3" }],
      lesson: "The canonical Flash Attention softmax recurrence.",
      gatedFeedbackVisibility: "after_attempt",
    },
  });

  await prisma.branch.upsert({
    where: {
      packageVersionId_branchId: {
        packageVersionId: packageVersion.id,
        branchId: "B002",
      },
    },
    update: {},
    create: {
      packageVersionId: packageVersion.id,
      decisionNodeId: decisionNode.id,
      branchId: "B002",
      type: "suboptimal",
      supportLevel: "partially_supported",
      choice: "Naive two-pass softmax",
      evidenceRefs: [{ ref: "artifact/PAPER.md#sec-2" }],
      lesson: "Why the naive approach blows up memory at long sequence lengths.",
      gatedFeedbackVisibility: "after_attempt",
    },
  });

  const existingEnrollment = await prisma.enrollment.findFirst({
    where: { userId: user.id, packageVersionId: packageVersion.id },
  });
  const enrollment =
    existingEnrollment ??
    (await prisma.enrollment.create({
      data: {
        userId: user.id,
        packageVersionId: packageVersion.id,
        activeStageRef: stage1.stageId,
        completedStageRefs: [],
        unlockedNodeRefs: [decisionNode.nodeId],
        status: "active",
      },
    }));

  // eslint-disable-next-line no-console
  console.log("Seed complete", {
    userId: user.id,
    membershipId: membership.id,
    packageId: pkg.id,
    packageVersionId: packageVersion.id,
    stageIds: [stage1.id, stage2.id],
    decisionNodeId: decisionNode.id,
    enrollmentId: enrollment.id,
  });
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
