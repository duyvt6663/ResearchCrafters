import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";

export const runtime = "nodejs";

type Body = {
  status: "succeeded" | "failed" | "timeout" | "oom" | "crashed";
  metrics?: Record<string, number>;
  logsUrl?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const body = (await req.json()) as Body;

  // Runner -> web callback. The runner authenticates with a service token in
  // the real implementation; until that lands, we still route through the
  // policy with a synthetic admin-style call so every API path uses the
  // single canAccess surface.
  const session = await getSession();
  const access = permissions.canAccess({
    user: session,
    packageVersionId: "runner-callback",
    stage: { ref: "runner-callback", isFreePreview: true, isLocked: false },
    action: "view_stage",
  });
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  await track("runner_job_completed", {
    runId: id,
    status: body.status,
  });

  return NextResponse.json({ ok: true, runId: id });
}
