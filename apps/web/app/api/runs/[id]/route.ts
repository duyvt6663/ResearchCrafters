import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { permissions } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await getSession();

  // Run visibility ties to the originating stage's view_stage policy. The
  // stub here uses a synthetic stage descriptor; real impl will resolve the
  // run -> submission -> stage chain.
  const access = permissions.canAccess({
    user: session,
    packageVersionId: "unknown",
    stage: { ref: "run", isFreePreview: false, isLocked: false },
    action: "view_stage",
  });
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  return NextResponse.json({
    run: {
      id,
      status: "queued",
      mode: "test",
      logsUrl: null,
      metrics: null,
    },
  });
}
