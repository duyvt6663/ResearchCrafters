import { NextResponse } from "next/server";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { getPackageBySlug } from "@/lib/data/packages";
import { getSessionFromRequest } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";
import { enrollResponseSchema } from "@/lib/api-contract";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const pkg = getPackageBySlug(slug);
  if (!pkg) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const session = await getSessionFromRequest(req);

  // Enrollment is gated by view_stage on the first preview stage — every
  // package has at least one free-preview stage, so this is the right axis.
  const firstStage = pkg.stages[0];
  const stubVersionId = `${pkg.slug}@stub`;
  const access = await permissions.canAccess({
    user: session,
    packageVersionId: stubVersionId,
    stage: {
      ref: firstStage?.ref ?? "S1",
      isFreePreview: firstStage?.isFreePreview ?? true,
      isLocked: false,
    },
    action: "view_stage",
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason },
      { status: denialHttpStatus(access.reason) },
    );
  }

  // Try to insert / find a real enrollment row when we have a userId. Falls
  // back to a synthesized id if the underlying packageVersion isn't seeded
  // (the data layer is still partly stubbed).
  let enrollmentId = `enr-${pkg.slug}-${Date.now()}`;
  let packageVersionId = stubVersionId;
  if (session.userId) {
    try {
      const liveVersion = await withQueryTimeout(
        prisma.packageVersion.findFirst({
          where: { package: { slug: pkg.slug }, status: "live" },
          select: { id: true },
          orderBy: { createdAt: "desc" },
        }),
      );
      if (liveVersion) {
        packageVersionId = liveVersion.id;
        const existing = await withQueryTimeout(
          prisma.enrollment.findFirst({
            where: { userId: session.userId, packageVersionId },
            select: { id: true },
          }),
        );
        const enrollment =
          existing ??
          (await withQueryTimeout(
            prisma.enrollment.create({
              data: {
                userId: session.userId,
                packageVersionId,
                activeStageRef: firstStage?.ref ?? null,
                completedStageRefs: [],
                unlockedNodeRefs: [],
                status: "active",
              },
              select: { id: true },
            }),
          ));
        enrollmentId = enrollment.id;
      }
    } catch {
      // DB unreachable / schema not migrated: fall back to synthesized id.
    }
  }

  await track("enrollment_started", {
    enrollmentId,
    packageSlug: pkg.slug,
    packageVersionId,
    userId: session.userId ?? "anon",
  });

  // Contract shape (lib/api-contract.ts) — the CLI consumes this directly.
  const contract = enrollResponseSchema.parse({
    enrollmentId,
    packageVersionId,
    firstStageRef: firstStage?.ref ?? "S1",
  });

  return NextResponse.json({
    ...contract,
    // Back-compat envelope for browser callers that still read
    // `body.enrollment.*`. Remove once the web UI is migrated to the flat
    // contract shape.
    enrollment: {
      id: enrollmentId,
      packageSlug: pkg.slug,
      packageVersionId,
      activeStageRef: firstStage?.ref ?? null,
    },
  });
}
