import { NextResponse } from "next/server";
import { getEnrollment } from "@/lib/data/enrollment";
import { getSessionFromRequest } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";

export const runtime = "nodejs";

type Body = {
  enrollmentId: string;
  insight: string;
  hardestDecision?: string;
  selectedBranchType?: "canonical" | "suboptimal" | "failed";
};

export async function POST(req: Request): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "bad_request", reason: "invalid_json" },
      { status: 400 },
    );
  }
  if (
    typeof body?.enrollmentId !== "string" ||
    typeof body?.insight !== "string"
  ) {
    return NextResponse.json(
      { error: "bad_request", reason: "missing_required_fields" },
      { status: 400 },
    );
  }
  const enr = await getEnrollment(body.enrollmentId);
  if (!enr) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const session = await getSessionFromRequest(req);
  const access = await permissions.canAccess({
    user: session,
    packageVersionId: enr.packageVersionId,
    stage: { ref: enr.activeStageRef, isFreePreview: false, isLocked: false },
    action: "create_share_card",
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason },
      { status: denialHttpStatus(access.reason) },
    );
  }

  const id = `sc-${Date.now()}`;
  await track("share_card_created", {
    shareCardId: id,
    enrollmentId: enr.id,
    packageVersionId: enr.packageVersionId,
  });

  // DB stub. Real impl writes an immutable share-card row with the snapshot
  // payload, then returns the public URL and rendered image asset.
  return NextResponse.json({
    shareCard: {
      id,
      enrollmentId: enr.id,
      packageVersionId: enr.packageVersionId,
      publicUrl: `https://researchcrafters.example/share/${id}`,
      imageUrl: `https://researchcrafters.example/share/${id}.png`,
      payload: {
        packageSlug: enr.packageSlug,
        completionStatus:
          enr.completedStageRefs.length > 0 ? "in_progress" : "started",
        learnerInsight: body.insight,
        hardestDecision: body.hardestDecision ?? null,
        selectedBranchType: body.selectedBranchType ?? null,
        cohortPercentage: null,
      },
    },
  });
}
