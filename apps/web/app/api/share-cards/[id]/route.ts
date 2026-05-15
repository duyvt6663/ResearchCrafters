import { NextResponse } from "next/server";
import { getEnrollment } from "@/lib/data/enrollment";
import {
  getShareCardById,
  revokeShareCardPublicSlug,
} from "@/lib/data/share-cards";
import { getSessionFromRequest } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";
import { setActiveSpanAttributes, withSpan } from "@/lib/tracing";

export const runtime = "nodejs";

type RouteParams = { id: string };

/**
 * Unshare path. Clears the share-card's `publicSlug` so the public URL +
 * image asset stop resolving. Idempotent: a card that is already private
 * still returns 200 so the caller can retry safely.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  return withSpan("api.share-cards.delete", async () => {
    const { id } = await ctx.params;
    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json(
        { error: "bad_request", reason: "missing_id" },
        { status: 400 },
      );
    }
    const card = await getShareCardById(id);
    if (!card) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const session = await getSessionFromRequest(req);
    setActiveSpanAttributes({
      "rc.actor": session.userId ?? "anon",
      "rc.share_card.id": card.id,
    });
    if (!session.userId) {
      return NextResponse.json(
        { error: "not_authenticated" },
        { status: 401 },
      );
    }
    if (card.userId !== session.userId) {
      // Treat cross-user revoke as 404 rather than 403 so an attacker
      // can't enumerate share-card ids by probing this endpoint.
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    // Reuse the create-share-card entitlement gate: the same membership
    // tier that can publish should be the one allowed to revoke.
    const enr = await getEnrollment(card.enrollmentId);
    if (enr) {
      const access = await permissions.canAccess({
        user: session,
        packageVersionId: card.packageVersionId,
        stage: {
          ref: enr.activeStageRef,
          isFreePreview: false,
          isLocked: false,
        },
        action: "create_share_card",
      });
      if (!access.allowed) {
        setActiveSpanAttributes({ "rc.access.denied": access.reason });
        return NextResponse.json(
          { error: access.reason },
          { status: denialHttpStatus(access.reason) },
        );
      }
    }

    const previousSlug = card.publicSlug;
    const updated = await revokeShareCardPublicSlug(card.id);
    if (previousSlug != null) {
      await track("share_card_unshared", {
        shareCardId: card.id,
        enrollmentId: card.enrollmentId,
        packageVersionId: card.packageVersionId,
        previousSlug,
      });
    }

    return NextResponse.json({
      shareCard: {
        id: card.id,
        enrollmentId: card.enrollmentId,
        packageVersionId: card.packageVersionId,
        publicSlug: null,
        publicUrl: null,
        imageUrl: null,
        revoked: previousSlug != null,
      },
      // Surface the updated payload + previous slug so callers can update
      // their UI without an extra fetch.
      previousSlug,
      payload: updated?.payload ?? card.payload,
    });
  });
}
