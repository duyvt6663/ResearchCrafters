import { NextResponse } from "next/server";
import { resolveActivePatchSeq } from "@researchcrafters/db";
import { getEnrollment, getStage } from "@/lib/data/enrollment";
import { getSessionFromRequest } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";
import { setActiveSpanAttributes, withSpan } from "@/lib/tracing";

export const runtime = "nodejs";

type Body = {
  enrollmentId: string;
  stageRef: string;
  answer: unknown;
  patchSeq?: number;
};

export async function POST(req: Request): Promise<NextResponse> {
  return withSpan("api.stage-attempts.create", async () => {
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
      typeof body?.stageRef !== "string"
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
    });
    const access = await permissions.canAccess({
      user: session,
      packageVersionId: enr.packageVersionId,
      stage: { ref: stage.ref, isFreePreview: stage.isFreePreview, isLocked: stage.isLocked },
      action: "submit_attempt",
    });
    if (!access.allowed) {
      setActiveSpanAttributes({ "rc.access.denied": access.reason });
      return NextResponse.json(
        { error: access.reason },
        { status: denialHttpStatus(access.reason) },
      );
    }

    const attemptId = `sa-${Date.now()}`;
    // Caller may pin a specific patch generation (replay / migration tooling);
    // otherwise resolve the currently-active patch_seq for the enrollment's
    // package version so telemetry attributes the attempt to the right
    // cosmetic patch generation. (backlog/06 §Version and Patch Policy
    // line 69.)
    let activePatchSeq = body.patchSeq;
    if (activePatchSeq == null) {
      try {
        activePatchSeq = await resolveActivePatchSeq(enr.packageVersionId);
      } catch {
        activePatchSeq = 0;
      }
    }
    await track("stage_attempt_submitted", {
      enrollmentId: enr.id,
      stageRef: stage.ref,
      attemptId,
      patchSeq: activePatchSeq,
    });

    return NextResponse.json({
      attempt: {
        id: attemptId,
        enrollmentId: enr.id,
        stageRef: stage.ref,
        status: "queued",
      },
    });
  });
}
