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

  const access = permissions.canAccess({
    user: session,
    packageVersionId: "unknown",
    stage: { ref: "grade", isFreePreview: false, isLocked: false },
    action: "view_stage",
  });
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  // Stubbed grade payload. Real shape will come from
  // @researchcrafters/evaluator-sdk once it exports its grade schema.
  return NextResponse.json({
    grade: {
      id,
      status: "partial",
      overall: 0.62,
      rubric: [
        { id: "r1", label: "Evidence grounding", score: 0.7, comment: "Cited two artifacts." },
        { id: "r2", label: "Causal reasoning", score: 0.5, comment: "Ambiguous on the IO bottleneck." },
        { id: "r3", label: "Clarity", score: 0.65, comment: "Tighten the second paragraph." },
      ],
      nextAction: "revise",
    },
  });
}
