import { NextResponse } from "next/server";
import { getPackageBySlug } from "@/lib/data/packages";
import { getSession } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const pkg = getPackageBySlug(slug);
  if (!pkg) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const session = await getSession();

  // Enrollment is gated by view_stage on the first preview stage — every
  // package has at least one free-preview stage, so this is the right axis.
  const firstStage = pkg.stages[0];
  const access = permissions.canAccess({
    user: session,
    packageVersionId: `${pkg.slug}@stub`,
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

  // Stub: synthesize an enrollment id. Real impl will insert into Postgres.
  const enrollmentId = `enr-${pkg.slug}-${Date.now()}`;
  await track("enrollment_started", {
    enrollmentId,
    packageSlug: pkg.slug,
    packageVersionId: `${pkg.slug}@stub`,
    userId: session.userId ?? "anon",
  });

  return NextResponse.json({
    enrollment: {
      id: enrollmentId,
      packageSlug: pkg.slug,
      packageVersionId: `${pkg.slug}@stub`,
      activeStageRef: firstStage?.ref ?? null,
    },
  });
}
