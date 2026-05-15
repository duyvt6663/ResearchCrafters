import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/packages/[slug]/enroll/route.ts`.
 *
 * Pins the workspace-provisioning surface added to the enroll response:
 *   - `starterUrl` is signed only when the deterministic starter object
 *     exists; absent otherwise.
 *   - `smokeCommand` is read from `manifest.smokeCommand` /
 *     `manifest.smoke_command`; absent otherwise.
 *   - storage failures fall back to no starter URL (anon / dev mode).
 */

const mocks = vi.hoisted(() => ({
  getPackageBySlug: vi.fn(),
  getSessionFromRequest: vi.fn(),
  canAccess: vi.fn(),
  packageVersionFindFirst: vi.fn(),
  enrollmentFindFirst: vi.fn(),
  enrollmentCreate: vi.fn(),
  withQueryTimeout: vi.fn(),
  track: vi.fn(),
  headObject: vi.fn(),
  signDownloadUrl: vi.fn(),
  getStorageEnv: vi.fn(),
}));

vi.mock("@/lib/data/packages", () => ({
  getPackageBySlug: mocks.getPackageBySlug,
}));

vi.mock("@/lib/auth", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}));

vi.mock("@/lib/permissions", () => ({
  permissions: { canAccess: mocks.canAccess },
  denialHttpStatus: () => 403,
}));

vi.mock("@/lib/telemetry", () => ({
  track: mocks.track,
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: {
    packageVersion: { findFirst: mocks.packageVersionFindFirst },
    enrollment: {
      findFirst: mocks.enrollmentFindFirst,
      create: mocks.enrollmentCreate,
    },
  },
  withQueryTimeout: mocks.withQueryTimeout,
}));

vi.mock("@/lib/storage", () => ({
  getStorageEnv: mocks.getStorageEnv,
  headObject: mocks.headObject,
  signDownloadUrl: mocks.signDownloadUrl,
}));

import { POST } from "../../app/api/packages/[slug]/enroll/route";

beforeEach(() => {
  mocks.getPackageBySlug.mockReset();
  mocks.getSessionFromRequest.mockReset();
  mocks.canAccess.mockReset();
  mocks.packageVersionFindFirst.mockReset();
  mocks.enrollmentFindFirst.mockReset();
  mocks.enrollmentCreate.mockReset();
  mocks.withQueryTimeout.mockReset();
  mocks.track.mockReset();
  mocks.headObject.mockReset();
  mocks.signDownloadUrl.mockReset();
  mocks.getStorageEnv.mockReset();

  mocks.withQueryTimeout.mockImplementation(async (p) => p);
  mocks.getStorageEnv.mockReturnValue({
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    accessKeyId: "k",
    secretAccessKey: "s",
    buckets: {
      submissions: "subs",
      runs: "runs",
      packages: "pkgs",
      shareCards: "share",
    },
  });
  mocks.getPackageBySlug.mockResolvedValue({
    slug: "resnet",
    stages: [{ ref: "S1", isFreePreview: true }],
  });
  mocks.canAccess.mockResolvedValue({ allowed: true });
});

function makeRequest(): { req: Request; ctx: { params: Promise<{ slug: string }> } } {
  return {
    req: new Request("http://localhost/api/packages/resnet/enroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    ctx: { params: Promise.resolve({ slug: "resnet" }) },
  };
}

describe("POST /api/packages/[slug]/enroll", () => {
  it("returns starterUrl + smokeCommand when storage has the object and manifest declares one", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-1" });
    mocks.packageVersionFindFirst.mockResolvedValue({
      id: "pv-resnet-live",
      manifest: { smokeCommand: "pnpm test" },
    });
    mocks.enrollmentFindFirst.mockResolvedValue(null);
    mocks.enrollmentCreate.mockResolvedValue({ id: "enr-real" });
    mocks.headObject.mockResolvedValue({ exists: true });
    mocks.signDownloadUrl.mockResolvedValue(
      "https://signed.example/starters/resnet/pv.tar.gz?sig=abc",
    );

    const { req, ctx } = makeRequest();
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.starterUrl).toBe(
      "https://signed.example/starters/resnet/pv.tar.gz?sig=abc",
    );
    expect(body.smokeCommand).toBe("pnpm test");
    expect(body.packageVersionId).toBe("pv-resnet-live");

    expect(mocks.headObject).toHaveBeenCalledWith({
      bucket: "pkgs",
      key: "starters/resnet/pv-resnet-live.tar.gz",
    });
    expect(mocks.signDownloadUrl).toHaveBeenCalledWith({
      bucket: "pkgs",
      key: "starters/resnet/pv-resnet-live.tar.gz",
    });
  });

  it("omits starterUrl when the starter object is absent", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-1" });
    mocks.packageVersionFindFirst.mockResolvedValue({
      id: "pv-resnet-live",
      manifest: { smokeCommand: "pnpm test" },
    });
    mocks.enrollmentFindFirst.mockResolvedValue({ id: "enr-existing" });
    mocks.headObject.mockResolvedValue({ exists: false });

    const { req, ctx } = makeRequest();
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.starterUrl).toBeUndefined();
    expect(body.smokeCommand).toBe("pnpm test");
    expect(mocks.signDownloadUrl).not.toHaveBeenCalled();
  });

  it("falls back to no starterUrl when storage throws", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-1" });
    mocks.packageVersionFindFirst.mockResolvedValue({
      id: "pv-resnet-live",
      manifest: {},
    });
    mocks.enrollmentFindFirst.mockResolvedValue({ id: "enr-existing" });
    mocks.headObject.mockRejectedValue(new Error("minio down"));

    const { req, ctx } = makeRequest();
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.starterUrl).toBeUndefined();
    expect(body.smokeCommand).toBeUndefined();
  });

  it("omits both fields for anonymous callers (no live version resolved)", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: null });
    mocks.headObject.mockResolvedValue({ exists: false });

    const { req, ctx } = makeRequest();
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.starterUrl).toBeUndefined();
    expect(body.smokeCommand).toBeUndefined();
    // packageVersionId falls back to the stub when no live row is loaded.
    expect(body.packageVersionId).toBe("resnet@stub");
    // The head check still happens (under the stub version id).
    expect(mocks.headObject).toHaveBeenCalledWith({
      bucket: "pkgs",
      key: "starters/resnet/resnet@stub.tar.gz",
    });
  });

  it("accepts manifest.smoke_command snake-case alias", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-1" });
    mocks.packageVersionFindFirst.mockResolvedValue({
      id: "pv-x",
      manifest: { smoke_command: "make smoke" },
    });
    mocks.enrollmentFindFirst.mockResolvedValue({ id: "enr-x" });
    mocks.headObject.mockResolvedValue({ exists: false });

    const { req, ctx } = makeRequest();
    const res = await POST(req, ctx);
    const body = await res.json();
    expect(body.smokeCommand).toBe("make smoke");
  });
});
