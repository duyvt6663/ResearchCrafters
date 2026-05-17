import { NextResponse } from "next/server";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { mentorRefusal } from "@researchcrafters/ui/copy";
import { getEnrollment, getStage } from "@/lib/data/enrollment";
import { getSessionFromRequest } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";
import {
  mentorMessageRequestSchema,
  mentorMessageResponseSchema,
} from "@/lib/api-contract";
import {
  defaultMentorRateLimiter,
  defaultMentorSpendStore,
  defaultMentorContextCache,
  runMentorRequest,
} from "@/lib/mentor-runtime";
import { setActiveSpanAttributes, withSpan } from "@/lib/tracing";

export const runtime = "nodejs";

/**
 * POST /api/mentor/messages
 *
 * Wires the mentor-safety pipeline behind the existing wire contract:
 *   1. Validate the body against `mentorMessageRequestSchema`.
 *   2. Resolve session (cookie or Bearer) — unauthenticated requests are
 *      refused with the same denial reasons every other route uses.
 *   3. Resolve enrollment + stage from the data layer (Prisma-backed) so the
 *      stage policy mirrored on `Stage.stagePolicy` JSON is the source of
 *      truth.
 *   4. Gate via `permissions.canAccess`. The mentor-policy denial path
 *      includes the authored refusal copy so the client doesn't have to
 *      invent a banner.
 *   5. Hand off to `mentor-runtime` which builds the mentor context, calls
 *      the gateway, runs leak tests, redacts, and persists the
 *      `MentorThread` + `MentorMessage` rows with full token telemetry.
 *
 * Wire shape: the existing `mentorMessageResponseSchema` is preserved (the
 * CLI reads it via the contract). The runtime's extra fields
 * (`redactionTriggered`, `threadId`, `messageId`) are recorded on the
 * persisted message rows + telemetry but not returned to the wire — the
 * contract is owned by `apps/web/lib/api-contract.ts` and is forbidden to
 * mutate from this workstream.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return withSpan("api.mentor.messages.post", async () => {
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

    const session = await getSessionFromRequest(req);
    setActiveSpanAttributes({
      "rc.actor": session.userId ?? "anon",
      "rc.mentor.mode": body.mode,
    });
    if (!session.userId) {
      return NextResponse.json(
        { error: "not_authenticated" },
        { status: 401 },
      );
    }

    const enr = await getEnrollment(body.enrollmentId);
    const stage = await getStage(body.enrollmentId, body.stageRef);
    if (!enr || !stage) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    setActiveSpanAttributes({
      "rc.enrollment": enr.id,
      "rc.stage": stage.ref,
    });

    const action =
      body.mode === "hint" || body.mode === "explain_branch"
        ? "request_mentor_hint"
        : "request_mentor_feedback";

    const access = await permissions.canAccess({
      user: session,
      packageVersionId: enr.packageVersionId,
      stage: {
        ref: stage.ref,
        isFreePreview: stage.isFreePreview,
        isLocked: stage.isLocked,
      },
      action,
    });
    if (!access.allowed) {
      // Pass through the authored refusal whenever the policy module signals
      // that the mentor itself blocked the request (vs an entitlement / lock
      // failure). The reason name `mentor_policy` is reserved by backlog/05 —
      // when the policy module surfaces it, the body carries copy the client
      // can render verbatim without inventing strings.
      setActiveSpanAttributes({ "rc.access.denied": access.reason });
      const refusal: { error: string; reason: typeof access.reason; refusal?: unknown } = {
        error: "forbidden",
        reason: access.reason,
      };
      if ((access.reason as string) === "mentor_policy") {
        refusal.refusal = mentorRefusal({ scope: "policy_block" });
      }
      return NextResponse.json(refusal, {
        status: denialHttpStatus(access.reason),
      });
    }

    if (body.mode === "hint" || body.mode === "explain_branch") {
      await track("mentor_hint_requested", {
        enrollmentId: enr.id,
        stageRef: stage.ref,
      });
    } else {
      await track("mentor_feedback_requested", {
        enrollmentId: enr.id,
        stageRef: stage.ref,
      });
    }

    // Hand off to the runtime. The runtime owns gateway construction (lazy —
    // degrades to a mock when ANTHROPIC_API_KEY is unset), leak-test +
    // redaction, and persistence with full model telemetry.
    const stageRow = await withQueryTimeout(
      prisma.stage.findUnique({
        where: {
          packageVersionId_stageId: {
            packageVersionId: enr.packageVersionId,
            stageId: stage.ref,
          },
        },
        select: { stagePolicy: true },
      }),
    );
    const stagePolicy = stageRow?.stagePolicy ?? null;
    if (stagePolicy === null) {
      return NextResponse.json(
        { error: "stage_policy_missing" },
        { status: 500 },
      );
    }

    const outcome = await runMentorRequest({
      enrollment: { id: enr.id, packageVersionId: enr.packageVersionId },
      stage: { ref: stage.ref, stagePolicy },
      mode: body.mode,
      message: body.message,
      userId: session.userId,
      rateLimiter: defaultMentorRateLimiter(),
      spendStore: defaultMentorSpendStore(),
      contextCache: defaultMentorContextCache(),
      track,
    });

    if (outcome.kind === "policy_misconfig") {
      return NextResponse.json(
        {
          error: "stage_policy_misconfigured",
          reason: outcome.reason,
        },
        { status: 500 },
      );
    }

    if (outcome.kind === "rate_limited") {
      // Authored copy — the model never composes the rate-limit refusal.
      // `Retry-After` carries the seconds-until-refresh hint the limiter
      // computed from the offending sliding window.
      setActiveSpanAttributes({
        "rc.mentor.rate_limited_scope": outcome.scope,
      });
      const refusal = mentorRefusal({ scope: "rate_limit" });
      return NextResponse.json(
        {
          error: "rate_limited",
          scope: outcome.scope,
          retryAfterSeconds: outcome.retryAfterSeconds,
          refusal,
        },
        {
          status: 429,
          headers: { "Retry-After": String(outcome.retryAfterSeconds) },
        },
      );
    }

    setActiveSpanAttributes({ "rc.mentor.message_id": outcome.messageId });

    const responseBody = mentorMessageResponseSchema.parse({
      message: {
        id: outcome.messageId,
        enrollmentId: enr.id,
        stageRef: stage.ref,
        mode: body.mode,
        role: "mentor",
        content: outcome.assistantText,
        createdAt: new Date().toISOString(),
      },
    });
    return NextResponse.json(responseBody);
  });
}
