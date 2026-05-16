import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionFromRequest } from "@/lib/auth";
import { isReviewer } from "@/lib/reviewer-access";
import { track } from "@/lib/telemetry";
import {
  applyReviewerOverride,
  GradeNotFoundError,
} from "@/lib/grading/grade-override";

export const runtime = "nodejs";

const overridePatchSchema = z
  .object({
    status: z.enum(["passed", "partial", "failed"]).optional(),
    rubricScore: z.number().min(0).max(1).optional(),
    feedback: z.string().min(1).max(8_000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "override patch must change at least one field",
  });

const overrideRequestSchema = z
  .object({
    note: z.string().min(1).max(8_000),
    override: overridePatchSchema,
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: gradeId } = await params;

  let parsedBody: z.infer<typeof overrideRequestSchema>;
  try {
    const raw = (await req.json()) as unknown;
    parsedBody = overrideRequestSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "bad_request", reason: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "bad_request", reason: "invalid_json" },
      { status: 400 },
    );
  }

  const session = await getSessionFromRequest(req);
  if (!session.userId) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 },
    );
  }

  if (!isReviewer(session.userId)) {
    // Reviewer-only endpoint: anyone else gets the same response shape as a
    // missing role, with no information about whether the grade exists.
    return NextResponse.json(
      { error: "reviewer_only" },
      { status: 403 },
    );
  }

  // Strip undefined keys so `exactOptionalPropertyTypes` matches the SDK's
  // optional-but-not-undefined override patch shape.
  const overridePatch: {
    status?: "passed" | "partial" | "failed";
    rubricScore?: number;
    feedback?: string;
  } = {};
  if (parsedBody.override.status !== undefined) {
    overridePatch.status = parsedBody.override.status;
  }
  if (parsedBody.override.rubricScore !== undefined) {
    overridePatch.rubricScore = parsedBody.override.rubricScore;
  }
  if (parsedBody.override.feedback !== undefined) {
    overridePatch.feedback = parsedBody.override.feedback;
  }

  try {
    const result = await applyReviewerOverride({
      gradeId,
      reviewerId: session.userId,
      note: parsedBody.note,
      override: overridePatch,
    });

    // Telemetry is fire-and-forget; failures must not block the override.
    void track("grade_overridden", {
      gradeId,
      reviewerId: session.userId,
      previousScore: result.previousScore,
      nextScore: result.nextScore,
    }).catch(() => undefined);

    return NextResponse.json(
      {
        grade: {
          id: result.grade.id,
          status: result.grade.status,
          rubricScore: result.grade.rubricScore,
          history: result.grade.history,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof GradeNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof Error) {
      // SDK-level validation (empty reviewerId / note) lands here. Map to 400
      // so the client can correct the request; the zod gate above usually
      // catches these first.
      const message = err.message;
      if (
        message.includes("reviewerId is required") ||
        message.includes("override note is required")
      ) {
        return NextResponse.json(
          { error: "bad_request", reason: message },
          { status: 400 },
        );
      }
    }
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 },
    );
  }
}
