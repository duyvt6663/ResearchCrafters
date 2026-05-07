import { NextResponse } from "next/server";
import { getEnrollment } from "@/lib/data/enrollment";
import { getSession } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const enr = await getEnrollment(id);
  if (!enr) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const session = await getSession();
  const access = permissions.canAccess({
    user: session,
    packageVersionId: enr.packageVersionId,
    stage: { ref: enr.activeStageRef, isFreePreview: true, isLocked: false },
    action: "view_stage",
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason },
      { status: denialHttpStatus(access.reason) },
    );
  }
  return NextResponse.json({ enrollment: enr });
}
