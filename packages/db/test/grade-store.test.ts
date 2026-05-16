// Unit tests for the shared Prisma-backed `GradeStore`. These cover the
// translation layer between SDK `Grade` objects and Prisma `Grade` rows.
// They do NOT touch a live database — `makePrismaGradeStore` accepts an
// injected Prisma surface so the mapping logic is unit-testable.

import { describe, expect, it, vi } from "vitest";
import type { Grade as SdkGrade } from "@researchcrafters/evaluator-sdk";

import {
  GradeNotFoundError,
  makePrismaGradeStore,
  type GradeStorePrisma,
} from "../src/grade-store.js";

interface PrismaGradeRowFixture {
  id: string;
  stageAttemptId: string;
  submissionId: string | null;
  rubricVersion: string;
  evaluatorVersion: string;
  passed: boolean;
  score: number | null;
  dimensions: unknown;
  evidenceRefs: unknown;
  modelMeta: unknown;
  history: unknown;
  createdAt: Date;
}

function makeRow(
  overrides: Partial<PrismaGradeRowFixture> = {},
): PrismaGradeRowFixture {
  return {
    id: "grade-1",
    stageAttemptId: "sa-1",
    submissionId: "sub-1",
    rubricVersion: "rubric-1.0",
    evaluatorVersion: "0.1.0",
    passed: true,
    score: 0.85,
    dimensions: [
      { id: "impl", label: "Implementation", score: 0.9, weight: 0.5 },
      { id: "explain", label: "Explanation", score: 0.8, weight: 0.5 },
    ],
    evidenceRefs: [],
    modelMeta: null,
    history: [],
    createdAt: new Date("2026-05-16T00:00:00Z"),
    ...overrides,
  };
}

function makeMockPrisma(): {
  prisma: GradeStorePrisma;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
} {
  const findUnique = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const transaction = vi.fn(
    async <T>(fn: (tx: GradeStorePrisma) => Promise<T>): Promise<T> =>
      fn({
        grade: { findUnique, create, update },
        $transaction: transaction as unknown as GradeStorePrisma["$transaction"],
      } as GradeStorePrisma),
  );
  const prisma: GradeStorePrisma = {
    grade: { findUnique, create, update },
    $transaction: transaction as unknown as GradeStorePrisma["$transaction"],
  };
  return { prisma, findUnique, create, update, transaction };
}

describe("makePrismaGradeStore: findByKey", () => {
  it("looks up the compound unique on a well-formed key and maps the row", async () => {
    const mock = makeMockPrisma();
    mock.findUnique.mockResolvedValue(makeRow());
    const store = makePrismaGradeStore({ prisma: mock.prisma });

    const grade = await store.findByKey("sub-1::rubric-1.0::0.1.0");

    expect(mock.findUnique).toHaveBeenCalledWith({
      where: {
        submissionId_rubricVersion_evaluatorVersion: {
          submissionId: "sub-1",
          rubricVersion: "rubric-1.0",
          evaluatorVersion: "0.1.0",
        },
      },
    });
    expect(grade).not.toBeNull();
    expect(grade?.id).toBe("grade-1");
    expect(grade?.status).toBe("passed");
    expect(grade?.rubricScore).toBe(0.85);
    expect(grade?.dimensions).toHaveLength(2);
    expect(grade?.stageId).toBe("sa-1");
    expect(grade?.createdAt).toBe("2026-05-16T00:00:00.000Z");
  });

  it("returns null when no row matches", async () => {
    const mock = makeMockPrisma();
    mock.findUnique.mockResolvedValue(null);
    const store = makePrismaGradeStore({ prisma: mock.prisma });

    const grade = await store.findByKey("sub-9::r::e");
    expect(grade).toBeNull();
    expect(mock.findUnique).toHaveBeenCalledTimes(1);
  });

  it("fails closed on a malformed key without hitting Prisma", async () => {
    const mock = makeMockPrisma();
    const store = makePrismaGradeStore({ prisma: mock.prisma });

    const grade = await store.findByKey("not-a-key");
    expect(grade).toBeNull();
    expect(mock.findUnique).not.toHaveBeenCalled();
  });

  it("reflects the latest override status from history when present", async () => {
    const mock = makeMockPrisma();
    mock.findUnique.mockResolvedValue(
      makeRow({
        passed: false,
        history: [
          {
            reviewerId: "rev-1",
            note: "rescored",
            appliedAt: "2026-05-15T00:00:00Z",
            override: { status: "partial" },
          },
        ],
      }),
    );
    const store = makePrismaGradeStore({ prisma: mock.prisma });

    const grade = await store.findByKey("sub-1::rubric-1.0::0.1.0");
    expect(grade?.status).toBe("partial");
    expect(grade?.history).toHaveLength(1);
  });
});

describe("makePrismaGradeStore: insert", () => {
  it("translates an SDK Grade into a Prisma create call", async () => {
    const mock = makeMockPrisma();
    mock.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...makeRow({
          id: data["id"] as string,
          stageAttemptId: data["stageAttemptId"] as string,
          submissionId: data["submissionId"] as string | null,
          rubricVersion: data["rubricVersion"] as string,
          evaluatorVersion: data["evaluatorVersion"] as string,
          passed: data["passed"] as boolean,
          score: data["score"] as number,
          dimensions: data["dimensions"],
          history: data["history"],
          createdAt: data["createdAt"] as Date,
        }),
      }),
    );
    const store = makePrismaGradeStore({ prisma: mock.prisma });

    const sdkGrade: SdkGrade = {
      id: "g-new",
      submissionId: "sub-7",
      stageId: "sa-7",
      rubricVersion: "rubric-1.0",
      evaluatorVersion: "0.1.0",
      status: "passed",
      rubricScore: 0.92,
      passThreshold: 0.7,
      dimensions: [
        {
          id: "impl",
          label: "Implementation",
          score: 1,
          weight: 0.5,
          evidenceRefs: ["fig-1"],
        },
        {
          id: "explain",
          label: "Explanation",
          score: 0.84,
          weight: 0.5,
          evidenceRefs: ["fig-1", "tbl-2"],
        },
      ],
      feedback: "good",
      history: [],
      createdAt: "2026-05-16T10:00:00.000Z",
    };

    const inserted = await store.insert(sdkGrade);

    expect(mock.create).toHaveBeenCalledTimes(1);
    const args = mock.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(args.data["id"]).toBe("g-new");
    expect(args.data["stageAttemptId"]).toBe("sa-7");
    expect(args.data["submissionId"]).toBe("sub-7");
    expect(args.data["passed"]).toBe(true);
    expect(args.data["score"]).toBe(0.92);
    expect(args.data["evidenceRefs"]).toEqual(["fig-1", "tbl-2"]);
    expect(args.data["createdAt"]).toBeInstanceOf(Date);
    expect(inserted.id).toBe("g-new");
    expect(inserted.status).toBe("passed");
  });

  it("collapses empty submissionId to null so the FK stays honest", async () => {
    const mock = makeMockPrisma();
    mock.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        makeRow({
          id: data["id"] as string,
          submissionId: data["submissionId"] as string | null,
        }),
    );
    const store = makePrismaGradeStore({ prisma: mock.prisma });

    await store.insert({
      id: "g-empty-sub",
      submissionId: "",
      stageId: "sa-1",
      rubricVersion: "rubric-1.0",
      evaluatorVersion: "0.1.0",
      status: "failed",
      rubricScore: 0,
      passThreshold: 0.7,
      dimensions: [],
      feedback: "",
      history: [],
      createdAt: "2026-05-16T10:00:00.000Z",
    });

    const args = mock.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(args.data["submissionId"]).toBeNull();
    expect(args.data["passed"]).toBe(false);
  });
});

describe("makePrismaGradeStore: appendOverride", () => {
  it("appends a new history entry inside a transaction and mirrors passed/score", async () => {
    const mock = makeMockPrisma();
    mock.findUnique.mockResolvedValue(
      makeRow({
        history: [
          {
            reviewerId: "rev-prior",
            note: "earlier",
            appliedAt: "2026-05-14T00:00:00Z",
            override: { rubricScore: 0.5 },
          },
        ],
        score: 0.5,
        passed: false,
      }),
    );
    mock.update.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) =>
        makeRow({
          id: where.id,
          history: data["history"],
          passed: (data["passed"] as boolean | undefined) ?? false,
          score: (data["score"] as number | null | undefined) ?? null,
        }),
    );
    const store = makePrismaGradeStore({ prisma: mock.prisma });

    const updated = await store.appendOverride("grade-1", {
      reviewerId: "rev-1",
      note: "rescored",
      appliedAt: "2026-05-16T00:00:00Z",
      override: { status: "passed", rubricScore: 0.92 },
    });

    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.update).toHaveBeenCalledTimes(1);
    const args = mock.update.mock.calls[0]?.[0] as {
      data: { history: unknown[]; passed?: boolean; score?: number };
    };
    expect(args.data.history).toHaveLength(2);
    expect(args.data.passed).toBe(true);
    expect(args.data.score).toBe(0.92);
    expect(updated.status).toBe("passed");
    expect(updated.rubricScore).toBe(0.92);
  });

  it("throws GradeNotFoundError when the row is missing", async () => {
    const mock = makeMockPrisma();
    mock.findUnique.mockResolvedValue(null);
    const store = makePrismaGradeStore({ prisma: mock.prisma });

    await expect(
      store.appendOverride("missing", {
        reviewerId: "rev-1",
        note: "x",
        appliedAt: "2026-05-16T00:00:00Z",
        override: { rubricScore: 0.5 },
      }),
    ).rejects.toBeInstanceOf(GradeNotFoundError);

    expect(mock.update).not.toHaveBeenCalled();
  });

  it("does not write passed/score when the patch omits them", async () => {
    const mock = makeMockPrisma();
    mock.findUnique.mockResolvedValue(makeRow({ passed: false, score: 0.4 }));
    mock.update.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) =>
        makeRow({
          id: where.id,
          history: data["history"],
          passed: false,
          score: 0.4,
        }),
    );
    const store = makePrismaGradeStore({ prisma: mock.prisma });

    await store.appendOverride("grade-1", {
      reviewerId: "rev-1",
      note: "feedback-only",
      appliedAt: "2026-05-16T00:00:00Z",
      override: { feedback: "see appendix" },
    });

    const args = mock.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(args.data).not.toHaveProperty("passed");
    expect(args.data).not.toHaveProperty("score");
    expect(args.data["history"]).toBeInstanceOf(Array);
  });
});
