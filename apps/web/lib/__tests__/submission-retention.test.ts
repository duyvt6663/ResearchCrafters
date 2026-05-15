import { describe, expect, it, vi } from "vitest";

// Mock telemetry so we can assert on it and so the test doesn't try to push
// to a real PostHog endpoint.
vi.mock("../telemetry", () => ({
  track: vi.fn(async () => {}),
}));

// Mock storage so the test never touches MinIO; we substitute deleteObject
// per call via the input override below, but we also need getStorageEnv to
// be cheap.
vi.mock("../storage", () => ({
  deleteObject: vi.fn(async () => undefined),
  getStorageEnv: () => ({
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    accessKeyId: "x",
    secretAccessKey: "x",
    buckets: {
      submissions: "researchcrafters-submissions",
      runs: "researchcrafters-runs",
      packages: "researchcrafters-packages",
      shareCards: "researchcrafters-share-cards",
    },
  }),
}));

// We never actually hit the DB; the suite passes a fake prisma into every
// call. Mock the package so the import succeeds even when the generated
// client isn't built.
vi.mock("@researchcrafters/db", () => ({
  prisma: {},
}));

import {
  DEFAULT_SUBMISSION_BUNDLE_RETENTION_DAYS,
  getSubmissionBundleRetentionDays,
  purgeExpiredSubmissionBundles,
  submissionBundleExpiresAt,
  type SubmissionRetentionPrisma,
} from "../submission-retention.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("getSubmissionBundleRetentionDays", () => {
  it("returns the default when env var is unset", () => {
    expect(getSubmissionBundleRetentionDays({})).toBe(
      DEFAULT_SUBMISSION_BUNDLE_RETENTION_DAYS,
    );
  });

  it("parses a positive integer", () => {
    expect(
      getSubmissionBundleRetentionDays({
        SUBMISSION_BUNDLE_RETENTION_DAYS: "7",
      }),
    ).toBe(7);
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["zero", "0"],
    ["negative", "-3"],
    ["NaN", "abc"],
    ["over the ceiling", "9999"],
  ])("falls back to default for %s value", (_label, value) => {
    expect(
      getSubmissionBundleRetentionDays({
        SUBMISSION_BUNDLE_RETENTION_DAYS: value,
      }),
    ).toBe(DEFAULT_SUBMISSION_BUNDLE_RETENTION_DAYS);
  });
});

describe("submissionBundleExpiresAt", () => {
  it("adds the configured window to createdAt", () => {
    const created = new Date("2026-05-01T00:00:00Z");
    const expires = submissionBundleExpiresAt(created, {
      SUBMISSION_BUNDLE_RETENTION_DAYS: "3",
    });
    expect(expires.toISOString()).toBe("2026-05-04T00:00:00.000Z");
  });

  it("uses the default window when env is missing", () => {
    const created = new Date("2026-05-01T00:00:00Z");
    const expires = submissionBundleExpiresAt(created, {});
    const diffDays = (expires.getTime() - created.getTime()) / ONE_DAY_MS;
    expect(diffDays).toBe(DEFAULT_SUBMISSION_BUNDLE_RETENTION_DAYS);
  });
});

type FakeRow = {
  id: string;
  bundleObjectKey: string;
  byteSize: number;
  createdAt: Date;
};

function makeFakePrisma(initial: FakeRow[]): {
  prisma: SubmissionRetentionPrisma;
  rows: FakeRow[];
  findManyCalls: unknown[];
} {
  const rows = initial.map((r) => ({ ...r }));
  const findManyCalls: unknown[] = [];
  const prisma: SubmissionRetentionPrisma = {
    submission: {
      // The real signature is overloaded; we only use the shape the module
      // calls with, so cast through `unknown` rather than re-declaring it.
      findMany: (async (args: { where: { createdAt: { lt: Date } } }) => {
        findManyCalls.push(args);
        const cutoff = args.where.createdAt.lt;
        return rows
          .filter((r) => r.createdAt < cutoff && r.bundleObjectKey !== "")
          .map((r) => ({
            id: r.id,
            bundleObjectKey: r.bundleObjectKey,
            byteSize: r.byteSize,
            createdAt: r.createdAt,
          }));
      }) as unknown as SubmissionRetentionPrisma["submission"]["findMany"],
      update: (async (args: {
        where: { id: string };
        data: { bundleObjectKey: string };
      }) => {
        const row = rows.find((r) => r.id === args.where.id);
        if (!row) throw new Error(`row ${args.where.id} not found`);
        row.bundleObjectKey = args.data.bundleObjectKey;
        return row;
      }) as unknown as SubmissionRetentionPrisma["submission"]["update"],
    },
  };
  return { prisma, rows, findManyCalls };
}

describe("purgeExpiredSubmissionBundles", () => {
  it("deletes the S3 object and clears the key for each expired row", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    const { prisma, rows } = makeFakePrisma([
      {
        id: "sub-old",
        bundleObjectKey: "submissions/sub-old/bundle.tar",
        byteSize: 1024,
        // 30 days old → past 14d default window
        createdAt: new Date(now.getTime() - 30 * ONE_DAY_MS),
      },
      {
        id: "sub-fresh",
        bundleObjectKey: "submissions/sub-fresh/bundle.tar",
        byteSize: 2048,
        // 1 day old → still within window
        createdAt: new Date(now.getTime() - 1 * ONE_DAY_MS),
      },
    ]);
    const deleteSpy = vi.fn(async () => undefined);
    const trackSpy = vi.fn(async () => {});

    const result = await purgeExpiredSubmissionBundles({
      now,
      prisma,
      deleteObject: deleteSpy,
      track: trackSpy,
      env: {},
    });

    expect(result.retentionDays).toBe(
      DEFAULT_SUBMISSION_BUNDLE_RETENTION_DAYS,
    );
    expect(result.considered).toBe(1);
    expect(result.purged).toBe(1);
    expect(result.failed).toBe(0);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith({
      bucket: "researchcrafters-submissions",
      key: "submissions/sub-old/bundle.tar",
    });
    expect(rows.find((r) => r.id === "sub-old")?.bundleObjectKey).toBe("");
    expect(rows.find((r) => r.id === "sub-fresh")?.bundleObjectKey).toBe(
      "submissions/sub-fresh/bundle.tar",
    );
    expect(trackSpy).toHaveBeenCalledWith(
      "submission_bundle_purged",
      expect.objectContaining({ submissionId: "sub-old", byteSize: 1024 }),
    );
  });

  it("skips rows already marked purged (empty bundleObjectKey)", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    const { prisma } = makeFakePrisma([
      {
        id: "sub-already-purged",
        bundleObjectKey: "",
        byteSize: 1024,
        createdAt: new Date(now.getTime() - 90 * ONE_DAY_MS),
      },
    ]);
    const deleteSpy = vi.fn(async () => undefined);

    const result = await purgeExpiredSubmissionBundles({
      now,
      prisma,
      deleteObject: deleteSpy,
      env: {},
    });

    expect(result.considered).toBe(0);
    expect(result.purged).toBe(0);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("counts a row as failed when S3 delete throws and leaves the row intact", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    const { prisma, rows } = makeFakePrisma([
      {
        id: "sub-broken",
        bundleObjectKey: "submissions/sub-broken/bundle.tar",
        byteSize: 1024,
        createdAt: new Date(now.getTime() - 30 * ONE_DAY_MS),
      },
    ]);
    const deleteSpy = vi.fn(async () => {
      throw new Error("minio is on fire");
    });

    const result = await purgeExpiredSubmissionBundles({
      now,
      prisma,
      deleteObject: deleteSpy,
      env: {},
    });

    expect(result.considered).toBe(1);
    expect(result.purged).toBe(0);
    expect(result.failed).toBe(1);
    // Row left intact so the next sweep retries it.
    expect(rows[0]?.bundleObjectKey).toBe(
      "submissions/sub-broken/bundle.tar",
    );
  });

  it("treats already-gone S3 objects as a successful purge", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    const { prisma, rows } = makeFakePrisma([
      {
        id: "sub-gone",
        bundleObjectKey: "submissions/sub-gone/bundle.tar",
        byteSize: 512,
        createdAt: new Date(now.getTime() - 20 * ONE_DAY_MS),
      },
    ]);
    // deleteObject already returns { deleted: true } for 404 in the real
    // module; we mirror that here.
    const deleteSpy = vi.fn(async () => undefined);

    const result = await purgeExpiredSubmissionBundles({
      now,
      prisma,
      deleteObject: deleteSpy,
      env: {},
    });

    expect(result.purged).toBe(1);
    expect(rows[0]?.bundleObjectKey).toBe("");
  });

  it("respects a custom retention window from env", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    const { prisma, findManyCalls } = makeFakePrisma([]);

    const result = await purgeExpiredSubmissionBundles({
      now,
      prisma,
      deleteObject: vi.fn(async () => undefined),
      env: { SUBMISSION_BUNDLE_RETENTION_DAYS: "3" },
    });

    expect(result.retentionDays).toBe(3);
    const args = findManyCalls[0] as {
      where: { createdAt: { lt: Date } };
    };
    const cutoff = args.where.createdAt.lt;
    expect(cutoff.toISOString()).toBe("2026-05-12T12:00:00.000Z");
  });
});
