import { NextResponse } from "next/server";
import { getEnrollment, getStage } from "@/lib/data/enrollment";
import { getSession } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";

export const runtime = "nodejs";

type Body = {
  enrollmentId: string;
  stageRef: string;
  nodeRef: string;
  branchId: string;
  confidence?: number;
};

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as Body;
  const enr = await getEnrollment(body.enrollmentId);
  const stage = await getStage(body.enrollmentId, body.stageRef);
  if (!enr || !stage) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await getSession();
  const access = permissions.canAccess({
    user: session,
    packageVersionId: enr.packageVersionId,
    stage: { ref: stage.ref, isFreePreview: stage.isFreePreview, isLocked: stage.isLocked },
    // A node traversal is a recorded decision; use submit_attempt as the
    // policy lever so paid stages cannot be silently traversed without
    // entitlement.
    action: "submit_attempt",
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason },
      { status: denialHttpStatus(access.reason) },
    );
  }

  await track("branch_selected", {
    enrollmentId: enr.id,
    stageRef: stage.ref,
    nodeRef: body.nodeRef,
    branchId: body.branchId,
    confidence: body.confidence ?? null,
  });

  return NextResponse.json({
    traversal: {
      id: `nt-${Date.now()}`,
      enrollmentId: enr.id,
      stageRef: stage.ref,
      nodeRef: body.nodeRef,
      branchId: body.branchId,
    },
  });
}
