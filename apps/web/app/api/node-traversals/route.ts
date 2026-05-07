import { NextResponse } from "next/server";
import { getEnrollment, getStage } from "@/lib/data/enrollment";
import { getSessionFromRequest } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";
import { setActiveSpanAttributes, withSpan } from "@/lib/tracing";

export const runtime = "nodejs";

type Body = {
  enrollmentId: string;
  stageRef: string;
  nodeRef: string;
  branchId: string;
  confidence?: number;
};

export async function POST(req: Request): Promise<NextResponse> {
  return withSpan("api.node-traversals.create", async () => {
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
      typeof body?.stageRef !== "string" ||
      typeof body?.nodeRef !== "string" ||
      typeof body?.branchId !== "string"
    ) {
      return NextResponse.json(
        { error: "bad_request", reason: "missing_required_fields" },
        { status: 400 },
      );
    }
    const enr = await getEnrollment(body.enrollmentId);
    const stage = await getStage(body.enrollmentId, body.stageRef);
    if (!enr || !stage) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const session = await getSessionFromRequest(req);
    setActiveSpanAttributes({
      "rc.actor": session.userId ?? "anon",
      "rc.enrollment": enr.id,
      "rc.stage": stage.ref,
      "rc.branch": body.branchId,
    });
    const access = await permissions.canAccess({
      user: session,
      packageVersionId: enr.packageVersionId,
      stage: { ref: stage.ref, isFreePreview: stage.isFreePreview, isLocked: stage.isLocked },
      // A node traversal is a recorded decision; use submit_attempt as the
      // policy lever so paid stages cannot be silently traversed without
      // entitlement.
      action: "submit_attempt",
    });
    if (!access.allowed) {
      setActiveSpanAttributes({ "rc.access.denied": access.reason });
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
  });
}
