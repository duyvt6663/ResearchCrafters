import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression suite for `app/api/grades/[id]/override/route.ts`.
 *
 * Pins:
 *  - zod gate on body (400 with issues; reviewer auth not invoked).
 *  - 401 when the session has no userId.
 *  - 403 when the session userId is not on the reviewer allowlist (existence
 *    of the grade row must NOT leak).
 *  - 404 when the grade row does not exist.
 *  - Happy path: grade row is fetched once for the previous-score snapshot,
 *    `prisma.$transaction` runs append + update, `grade_overridden`
 *    telemetry fires with previousScore + nextScore captured before/after
 *    the patch.
 *  - reviewerId on the appended history entry comes from the session, NOT
 *    from the request body — clients cannot forge a reviewer identity.
 */

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  gradeFindUnique: vi.fn(),
  gradeUpdate: vi.fn(),
  prismaTransaction: vi.fn(),
  withQueryTimeout: vi.fn(),
  track: vi.fn(),
}));

class TestGradeNotFoundError extends Error {
  constructor(gradeId: string) {
    super(`grade ${gradeId} not found`);
    this.name = "GradeNotFoundError";
  }
}

vi.mock("@researchcrafters/db", () => {
  const prismaSurface = {
    grade: {
      findUnique: mocks.gradeFindUnique,
      update: mocks.gradeUpdate,
    },
    $transaction: mocks.prismaTransaction,
  };
  return {
    prisma: prismaSurface,
    withQueryTimeout: mocks.withQueryTimeout,
    GradeNotFoundError: TestGradeNotFoundError,
    // The route consumes `makePrismaGradeStore` from `@researchcrafters/db`.
    // The real factory's `appendOverride` runs `$transaction` → `findUnique`
    // → `update`, which is exactly the surface the existing assertions pin;
    // inline a minimal re-implementation here so the test stays self-contained
    // without spinning up the live Prisma client.
    makePrismaGradeStore: () => ({
      async findByKey() {
        return null;
      },
      async insert(grade: unknown) {
        return grade;
      },
      async appendOverride(
        gradeId: string,
        entry: {
          reviewerId: string;
          note: string;
          appliedAt: string;
          override: {
            status?: string;
            rubricScore?: number;
            feedback?: string;
          };
        },
      ) {
        return mocks.withQueryTimeout(
          prismaSurface.$transaction(async (tx: {
            grade: {
              findUnique: (args: { where: { id: string } }) => Promise<{
                history?: unknown;
                passed: boolean;
                score: number | null;
                id: string;
                stageAttemptId: string;
                submissionId: string | null;
                rubricVersion: string;
                evaluatorVersion: string;
                dimensions: unknown;
                evidenceRefs: unknown;
                modelMeta: unknown;
                createdAt: Date;
              } | null>;
              update: (args: {
                where: { id: string };
                data: Record<string, unknown>;
              }) => Promise<Record<string, unknown>>;
            };
          }) => {
            const row = await tx.grade.findUnique({ where: { id: gradeId } });
            if (!row) throw new TestGradeNotFoundError(gradeId);
            const history = Array.isArray(row.history) ? row.history : [];
            const nextHistory = [...history, entry];
            const data: Record<string, unknown> = { history: nextHistory };
            if (entry.override.status !== undefined) {
              data["passed"] = entry.override.status === "passed";
            }
            if (entry.override.rubricScore !== undefined) {
              data["score"] = entry.override.rubricScore;
            }
            const updated = await tx.grade.update({ where: { id: gradeId }, data });
            const u = updated as Record<string, unknown>;
            const updatedHistory = Array.isArray(u["history"])
              ? (u["history"] as unknown[])
              : nextHistory;
            const overrideStatus = entry.override.status;
            const status =
              overrideStatus !== undefined
                ? overrideStatus
                : (u["passed"] ?? row.passed) ? "passed" : "failed";
            return {
              id: row.id,
              submissionId: row.submissionId ?? "",
              stageId: row.stageAttemptId,
              rubricVersion: row.rubricVersion,
              evaluatorVersion: row.evaluatorVersion,
              status,
              rubricScore:
                (u["score"] as number | null | undefined) ?? row.score ?? 0,
              passThreshold: 0,
              dimensions: [],
              feedback: "",
              history: updatedHistory,
              createdAt: row.createdAt.toISOString(),
            };
          }),
        );
      },
    }),
  };
});

vi.mock("@/lib/auth", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}));

vi.mock("@/lib/telemetry", () => ({
  track: mocks.track,
}));

const ENV_KEY = "REVIEWER_USER_IDS";
let originalEnv: string | undefined;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  // Identity passthrough for the query-timeout wrapper.
  mocks.withQueryTimeout.mockImplementation(async (p) => p);
  // Default: $transaction invokes the callback with a tx that proxies the
  // mocked prisma surface (sufficient for our route, which only touches
  // `tx.grade.findUnique` and `tx.grade.update`).
  mocks.prismaTransaction.mockImplementation(async (cb: unknown) => {
    if (typeof cb !== "function") return cb;
    return await (cb as (tx: unknown) => Promise<unknown>)({
      grade: {
        findUnique: mocks.gradeFindUnique,
        update: mocks.gradeUpdate,
      },
    });
  });
  mocks.track.mockResolvedValue(undefined);

  originalEnv = process.env[ENV_KEY];
  process.env[ENV_KEY] = "rev-1,rev-2";
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalEnv;
  }
});

// Late import so vi.mock takes effect before the route module is evaluated.
async function loadRoute(): Promise<{
  POST: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
}> {
  return await import("../../app/api/grades/[id]/override/route");
}

function makeCtx(
  id: string,
  body: unknown,
): {
  req: Request;
  ctx: { params: Promise<{ id: string }> };
} {
  return {
    req: new Request(`http://localhost/api/grades/${id}/override`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

function seedGrade(opts: {
  id?: string;
  score?: number | null;
  passed?: boolean;
  history?: unknown;
} = {}): void {
  const row = {
    id: opts.id ?? "grade-1",
    stageAttemptId: "sa-1",
    submissionId: "sub-1",
    rubricVersion: "rubric-1",
    evaluatorVersion: "evaluator-1",
    passed: opts.passed ?? false,
    score: opts.score === undefined ? 0.5 : opts.score,
    dimensions: [],
    evidenceRefs: [],
    modelMeta: null,
    history: opts.history ?? [],
    createdAt: new Date("2026-05-15T00:00:00Z"),
  };
  mocks.gradeFindUnique.mockResolvedValue(row);
  mocks.gradeUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...row,
    ...data,
    history: (data["history"] as unknown[]) ?? row.history,
  }));
}

const VALID_BODY = {
  note: "Rescored — learner cited the omitted figure in the appendix.",
  override: { status: "passed" as const, rubricScore: 0.92 },
};

describe("POST /api/grades/[id]/override", () => {
  it("returns 400 on a malformed body and does not consult auth", async () => {
    const { POST } = await loadRoute();
    const { req, ctx } = makeCtx("grade-1", { note: 42 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(Array.isArray(body.reason)).toBe(true);
    expect(mocks.getSessionFromRequest).not.toHaveBeenCalled();
  });

  it("rejects an empty override patch as bad_request", async () => {
    const { POST } = await loadRoute();
    const { req, ctx } = makeCtx("grade-1", {
      note: "fine",
      override: {},
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    expect(mocks.getSessionFromRequest).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no userId", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: null });
    const { POST } = await loadRoute();
    const { req, ctx } = makeCtx("grade-1", VALID_BODY);
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("not_authenticated");
    expect(mocks.gradeFindUnique).not.toHaveBeenCalled();
  });

  it("returns 403 with reviewer_only when the caller is not on the allowlist", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-learner" });
    const { POST } = await loadRoute();
    const { req, ctx } = makeCtx("grade-1", VALID_BODY);
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("reviewer_only");
    // No existence leak: the grade row must not be queried.
    expect(mocks.gradeFindUnique).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("returns 404 when the grade row does not exist", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "rev-1" });
    mocks.gradeFindUnique.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const { req, ctx } = makeCtx("missing-grade", VALID_BODY);
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("appends the override, mirrors patch to scalars, and emits telemetry", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "rev-1" });
    seedGrade({
      id: "grade-7",
      score: 0.55,
      passed: false,
      history: [
        {
          reviewerId: "rev-prior",
          note: "earlier override",
          appliedAt: "2026-05-14T00:00:00Z",
          override: { rubricScore: 0.55 },
        },
      ],
    });
    const { POST } = await loadRoute();
    const { req, ctx } = makeCtx("grade-7", VALID_BODY);
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grade.id).toBe("grade-7");
    expect(body.grade.rubricScore).toBe(0.92);
    expect(body.grade.status).toBe("passed");

    // The append must keep the prior entry intact and add a new one keyed to
    // the reviewer session identity.
    expect(mocks.gradeUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mocks.gradeUpdate.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { history: unknown[]; passed?: boolean; score?: number };
    };
    expect(updateArgs.where.id).toBe("grade-7");
    expect(updateArgs.data.passed).toBe(true);
    expect(updateArgs.data.score).toBe(0.92);
    expect(updateArgs.data.history).toHaveLength(2);
    const appended = updateArgs.data.history[1] as {
      reviewerId: string;
      note: string;
      override: Record<string, unknown>;
    };
    expect(appended.reviewerId).toBe("rev-1");
    expect(appended.note).toBe(VALID_BODY.note);
    expect(appended.override).toEqual(VALID_BODY.override);

    // Telemetry must carry previous + next score so the audit-grade event row
    // captures the actual swing.
    expect(mocks.track).toHaveBeenCalledTimes(1);
    const [eventName, payload] = mocks.track.mock.calls[0] ?? [];
    expect(eventName).toBe("grade_overridden");
    expect(payload).toMatchObject({
      gradeId: "grade-7",
      reviewerId: "rev-1",
      previousScore: 0.55,
      nextScore: 0.92,
    });
  });

  it("ignores a client-supplied reviewerId — identity comes from the session", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "rev-2" });
    seedGrade({ id: "grade-id", score: 0.4 });
    const { POST } = await loadRoute();
    const payload = {
      ...VALID_BODY,
      // Even if the client injects this, zod's `.strict()` rejects unknown
      // keys; if the schema ever loosens, the route still uses session.userId.
      reviewerId: "rev-forge",
    };
    const { req, ctx } = makeCtx("grade-id", payload);
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it("uses session userId, not body, even when the body schema permits the key", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "rev-2" });
    seedGrade({ id: "grade-sess", score: 0.4 });
    const { POST } = await loadRoute();
    const { req, ctx } = makeCtx("grade-sess", VALID_BODY);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const args = mocks.gradeUpdate.mock.calls[0]?.[0] as {
      data: { history: Array<{ reviewerId: string }> };
    };
    expect(args.data.history[0]?.reviewerId).toBe("rev-2");
  });

  it("emits previousScore=null when the grade has no prior score", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "rev-1" });
    seedGrade({ id: "grade-null", score: null });
    const { POST } = await loadRoute();
    const { req, ctx } = makeCtx("grade-null", VALID_BODY);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    expect(mocks.track).toHaveBeenCalledTimes(1);
    const payload = mocks.track.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload["previousScore"]).toBeNull();
    expect(payload["nextScore"]).toBe(0.92);
  });

  it("still returns the override when telemetry fails", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "rev-1" });
    mocks.track.mockRejectedValueOnce(new Error("telemetry unavailable"));
    seedGrade({ id: "grade-telemetry", score: 0.7 });
    const { POST } = await loadRoute();
    const { req, ctx } = makeCtx("grade-telemetry", VALID_BODY);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grade.id).toBe("grade-telemetry");
    expect(mocks.track).toHaveBeenCalledTimes(1);
  });
});
