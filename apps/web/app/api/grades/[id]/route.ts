import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { permissions } from "@/lib/permissions";
import { prisma, withQueryTimeout } from "@researchcrafters/db";

export const runtime = "nodejs";

type RawOverrideEntry = {
  reviewerId?: unknown;
  note?: unknown;
  appliedAt?: unknown;
  override?: unknown;
};

type LearnerOverride = {
  reviewerId: string;
  note: string;
  appliedAt: string;
  patch: {
    status?: string;
    rubricScore?: number;
    feedback?: string;
  };
};

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function normalizeLearnerOverrides(raw: unknown): LearnerOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: LearnerOverride[] = [];
  for (const entry of raw as RawOverrideEntry[]) {
    if (!entry || typeof entry !== "object") continue;
    const { reviewerId, note, appliedAt, override } = entry;
    if (!isString(reviewerId) || !isString(note) || !isString(appliedAt)) {
      continue;
    }
    const patch: LearnerOverride["patch"] = {};
    if (override && typeof override === "object") {
      const p = override as Record<string, unknown>;
      if (isString(p["status"])) patch.status = p["status"];
      if (typeof p["rubricScore"] === "number") {
        patch.rubricScore = p["rubricScore"];
      }
      if (isString(p["feedback"])) patch.feedback = p["feedback"];
    }
    out.push({ reviewerId, note, appliedAt, patch });
  }
  return out;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await getSessionFromRequest(req);

  const access = await permissions.canAccess({
    user: session,
    packageVersionId: "unknown",
    stage: { ref: "grade", isFreePreview: false, isLocked: false },
    action: "view_stage",
  });
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  // Reviewer-override history is the only piece of the Grade row that comes
  // from the database today. The rest of the payload remains the stubbed
  // rubric panel pending the full Grade lookup tracked in backlog/06. We
  // surface the appended history so a learner viewing their grade can see
  // reviewer overrides + the reviewer note that explains each one.
  let overrides: LearnerOverride[] = [];
  try {
    const row = (await withQueryTimeout(
      prisma.grade.findUnique({
        where: { id },
        select: { history: true },
      }),
    )) as { history: unknown } | null;
    if (row) {
      overrides = normalizeLearnerOverrides(row.history);
    }
  } catch {
    // DB unreachable: degrade gracefully. The learner still gets the stub
    // rubric panel; we just can't show overrides this request.
    overrides = [];
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
      overrides,
    },
  });
}
