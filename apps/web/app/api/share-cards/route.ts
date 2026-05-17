import { NextResponse } from "next/server";
import type { Prisma } from "@researchcrafters/db";
import { generatePublicSlug } from "@researchcrafters/worker";
import { getEnrollment } from "@/lib/data/enrollment";
import { getPackageBySlug } from "@/lib/data/packages";
import { createShareCard } from "@/lib/data/share-cards";
import { getSessionFromRequest } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";
import { setActiveSpanAttributes, withSpan } from "@/lib/tracing";
import {
  buildShareCardPayload,
  type AuthoredBranchType,
} from "@/lib/share-cards";

export const runtime = "nodejs";

type Body = {
  enrollmentId: string;
  insight?: string;
  hardestDecision?: string;
  selectedBranchType?: AuthoredBranchType;
};

const VALID_BRANCH_TYPES: ReadonlySet<AuthoredBranchType> = new Set([
  "canonical",
  "suboptimal",
  "failed",
]);

export async function POST(req: Request): Promise<NextResponse> {
  return withSpan("api.share-cards.create", async () => {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json(
        { error: "bad_request", reason: "invalid_json" },
        { status: 400 },
      );
    }
    if (typeof body?.enrollmentId !== "string") {
      return NextResponse.json(
        { error: "bad_request", reason: "missing_required_fields" },
        { status: 400 },
      );
    }
    if (body.insight !== undefined && typeof body.insight !== "string") {
      return NextResponse.json(
        { error: "bad_request", reason: "invalid_insight" },
        { status: 400 },
      );
    }
    if (
      body.selectedBranchType !== undefined &&
      !VALID_BRANCH_TYPES.has(body.selectedBranchType)
    ) {
      return NextResponse.json(
        { error: "bad_request", reason: "invalid_branch_type" },
        { status: 400 },
      );
    }
    const enr = await getEnrollment(body.enrollmentId);
    if (!enr) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const session = await getSessionFromRequest(req);
    setActiveSpanAttributes({
      "rc.actor": session.userId ?? "anon",
      "rc.enrollment": enr.id,
    });
    const access = await permissions.canAccess({
      user: session,
      packageVersionId: enr.packageVersionId,
      stage: { ref: enr.activeStageRef, isFreePreview: false, isLocked: false },
      action: "create_share_card",
    });
    if (!access.allowed) {
      setActiveSpanAttributes({ "rc.access.denied": access.reason });
      return NextResponse.json(
        { error: access.reason },
        { status: denialHttpStatus(access.reason) },
      );
    }

    const pkg = await getPackageBySlug(enr.packageSlug);
    const payload = buildShareCardPayload({
      enrollment: {
        packageSlug: enr.packageSlug,
        packageVersionId: enr.packageVersionId,
        completedStageRefs: enr.completedStageRefs,
      },
      pkg: pkg
        ? {
            stages: pkg.stages,
            sampleDecision: pkg.sampleDecision
              ? { prompt: pkg.sampleDecision.prompt }
              : null,
          }
        : null,
      // backlog/06 §Share Cards: include learner-written insight when
      // available — `buildShareCardPayload` trims, caps, and suppresses
      // blank values so the payload key is only present when meaningful.
      insight: body.insight ?? null,
      hardestDecision: body.hardestDecision ?? null,
      selectedBranchType: body.selectedBranchType ?? null,
      // Cohort percentage requires persisted `node_traversals` + minimum-N
      // suppression; until that lands (backlog/06), suppress by default.
      cohortPercentage: null,
    });

    if (!session.userId) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }

    const publicSlug = generatePublicSlug();
    const record = await createShareCard({
      userId: session.userId,
      enrollmentId: enr.id,
      packageVersionId: enr.packageVersionId,
      payload: payload as unknown as Prisma.InputJsonValue,
      publicSlug,
    });

    setActiveSpanAttributes({ "rc.share_card.id": record.id });
    await track("share_card_created", {
      shareCardId: record.id,
      enrollmentId: enr.id,
      packageVersionId: enr.packageVersionId,
    });

    return NextResponse.json({
      shareCard: {
        id: record.id,
        enrollmentId: enr.id,
        packageVersionId: enr.packageVersionId,
        publicSlug,
        publicUrl: `https://researchcrafters.example/share/${publicSlug}`,
        imageUrl: `https://researchcrafters.example/share/${publicSlug}.png`,
        payload,
      },
    });
  });
}
