import { NextResponse } from "next/server";
import { getEnrollment, getStage } from "@/lib/data/enrollment";
import { getSessionFromRequest } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";
import {
  mentorMessageRequestSchema,
  mentorMessageResponseSchema,
} from "@/lib/api-contract";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = mentorMessageRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", reason: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const enr = getEnrollment(body.enrollmentId);
  const stage = getStage(body.stageRef);
  if (!enr || !stage) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await getSessionFromRequest(req);
  const action =
    body.mode === "hint"
      ? "request_mentor_hint"
      : "request_mentor_feedback";

  const access = await permissions.canAccess({
    user: session,
    packageVersionId: enr.packageVersionId,
    stage: { ref: stage.ref, isFreePreview: stage.isFreePreview, isLocked: stage.isLocked },
    action,
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason },
      { status: denialHttpStatus(access.reason) },
    );
  }

  if (body.mode === "hint") {
    await track("mentor_hint_requested", { enrollmentId: enr.id, stageRef: stage.ref });
  } else {
    await track("mentor_feedback_requested", { enrollmentId: enr.id, stageRef: stage.ref });
  }

  // Deterministic stub response. Real implementation will route through
  // @researchcrafters/ai (LLM gateway with guardrails). We return authored
  // copy here because the policy module owns "no model-generated refusal" —
  // any real refusal will use the ui/copy module too.
  const reply = `Hint stub for stage ${stage.ref} (${body.mode}). Use the evidence panel and rubric.`;
  const responseBody = mentorMessageResponseSchema.parse({
    message: {
      id: `m-${Date.now()}`,
      enrollmentId: enr.id,
      stageRef: stage.ref,
      mode: body.mode,
      role: "mentor",
      content: reply,
      createdAt: new Date().toISOString(),
    },
  });
  return NextResponse.json(responseBody);
}
