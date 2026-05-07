import { NextResponse } from "next/server";
import { getEnrollment, getStage } from "@/lib/data/enrollment";
import { getSession } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";

export const runtime = "nodejs";

type Body = {
  enrollmentId: string;
  stageRef: string;
  answer: unknown;
  patchSeq?: number;
};

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as Body;
  const enr = await getEnrollment(body.enrollmentId);
  const stage = await getStage(body.enrollmentId, body.stageRef);
  if (!enr || !stage) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await getSession();
  const access = await permissions.canAccess({
    user: session,
    packageVersionId: enr.packageVersionId,
    stage: { ref: stage.ref, isFreePreview: stage.isFreePreview, isLocked: stage.isLocked },
    action: "submit_attempt",
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason },
      { status: denialHttpStatus(access.reason) },
    );
  }

  const attemptId = `sa-${Date.now()}`;
  await track("stage_attempt_submitted", {
    enrollmentId: enr.id,
    stageRef: stage.ref,
    attemptId,
    patchSeq: body.patchSeq ?? 0,
  });

  return NextResponse.json({
    attempt: {
      id: attemptId,
      enrollmentId: enr.id,
      stageRef: stage.ref,
      status: "queued",
    },
  });
}
