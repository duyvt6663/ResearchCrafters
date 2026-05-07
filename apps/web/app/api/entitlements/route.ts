import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { permissions } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);

  const access = await permissions.canAccess({
    user: session,
    packageVersionId: "entitlements",
    stage: { ref: "entitlements", isFreePreview: true, isLocked: false },
    action: "view_stage",
  });
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  // Stub: report a single bundle entitlement when the session is the paid
  // stub user; otherwise no entitlements. Real impl will query the
  // memberships + entitlements tables in @researchcrafters/db.
  if (session.userId === "u-paid") {
    return NextResponse.json({
      entitlements: [
        {
          id: "ent-stub-paid",
          userId: session.userId,
          kind: "membership_individual",
          scope: "all_packages",
          startsAt: "2026-01-01T00:00:00Z",
          endsAt: null,
        },
      ],
    });
  }
  return NextResponse.json({ entitlements: [] });
}
