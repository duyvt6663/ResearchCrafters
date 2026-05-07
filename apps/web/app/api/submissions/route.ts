import { NextResponse } from "next/server";
import { getEnrollment, getStage } from "@/lib/data/enrollment";
import { getSession } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";

export const runtime = "nodejs";

type Body = {
  enrollmentId: string;
  stageRef: string;
  bundleSize?: number;
  bundleSha256?: string;
};

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as Body;
  const enr = getEnrollment(body.enrollmentId);
  const stage = getStage(body.stageRef);
  if (!enr || !stage) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await getSession();
  const access = permissions.canAccess({
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

  const submissionId = `sub-${Date.now()}`;
  await track("runner_job_started", {
    submissionId,
    enrollmentId: enr.id,
    stageRef: stage.ref,
  });

  // Signed-URL placeholder. Real impl will mint an S3-compatible URL with a
  // short expiry plus a pre-set content-length cap and SHA verification.
  return NextResponse.json({
    submission: {
      id: submissionId,
      enrollmentId: enr.id,
      stageRef: stage.ref,
      status: "awaiting_upload",
    },
    upload: {
      url: `https://stub-storage.local/upload/${submissionId}`,
      method: "PUT",
      headers: { "x-rc-submission-id": submissionId },
      expiresInSeconds: 600,
    },
  });
}
