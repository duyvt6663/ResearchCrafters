import { NextResponse } from "next/server";
import { getPackageBySlug } from "@/lib/data/packages";
import { getSession } from "@/lib/auth";
import { permissions } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const pkg = getPackageBySlug(slug);
  if (!pkg) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const session = await getSession();
  const access = permissions.canAccess({
    user: session,
    packageVersionId: `${pkg.slug}@stub`,
    stage: { ref: "overview", isFreePreview: true, isLocked: false },
    action: "view_stage",
  });
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }
  return NextResponse.json({ package: pkg });
}
