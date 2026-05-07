import { NextResponse } from "next/server";
import { listPackages } from "@/lib/data/packages";
import { getSession } from "@/lib/auth";
import { permissions } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  // Catalog is treated as a free `view_stage` action against a synthetic
  // "preview" stage so we route through the same policy surface every other
  // route uses. Real impl will move catalog visibility into the policy.
  const access = await permissions.canAccess({
    user: session,
    packageVersionId: "catalog",
    stage: { ref: "catalog", isFreePreview: true, isLocked: false },
    action: "view_stage",
  });
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }
  return NextResponse.json({ packages: listPackages() });
}
