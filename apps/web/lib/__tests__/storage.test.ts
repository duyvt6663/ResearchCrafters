// Unit tests for the S3-compatible storage helper.
//
// We mock both `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` so the
// test suite runs without the real SDK installed, and so we can assert on
// command shape (Bucket / Key / Metadata / ContentType) end-to-end.
//
// The mocks approximate MinIO behaviour:
//   - `signUploadUrl` -> presign returns a synthetic URL containing the
//     bucket, key, and expiry so we can assert on it directly.
//   - `headObject` -> server stores `x-amz-meta-sha256` (returned via the
//     `Metadata` map) and `ContentLength`.
//   - `putObject` -> records the bucket+key+body for round-trip assertions.

import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// SDK mocks
// ---------------------------------------------------------------------------

type FakeCommand =
  | { __type: "PutObject"; input: Record<string, unknown> }
  | { __type: "GetObject"; input: Record<string, unknown> }
  | { __type: "HeadObject"; input: Record<string, unknown> };

type FakeStoredObject = {
  body: string;
  contentType?: string;
  metadata?: Record<string, string>;
};

const { fakeStore, fakePut, fakeGet, fakeHead, presignSpy, sendSpy } = vi.hoisted(
  () => {
    const store = new Map<string, FakeStoredObject>();
    return {
      fakeStore: store,
      fakePut: vi.fn(),
      fakeGet: vi.fn(),
      fakeHead: vi.fn(),
      presignSpy: vi.fn(),
      sendSpy: vi.fn(),
    };
  },
);

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    constructor(public readonly config: unknown) {}
    async send(command: FakeCommand): Promise<unknown> {
      sendSpy(command);
      if (command.__type === "PutObject") {
        const key = `${command.input["Bucket"] as string}/${command.input["Key"] as string}`;
        const body = command.input["Body"];
        const stored: FakeStoredObject = {
          body:
            typeof body === "string"
              ? body
              : body instanceof Uint8Array
                ? Buffer.from(body).toString("utf-8")
                : "",
        };
        if (typeof command.input["ContentType"] === "string") {
          stored.contentType = command.input["ContentType"] as string;
        }
        if (command.input["Metadata"]) {
          stored.metadata = command.input["Metadata"] as Record<string, string>;
        }
        fakeStore.set(key, stored);
        fakePut(command.input);
        return {};
      }
      if (command.__type === "GetObject") {
        const key = `${command.input["Bucket"] as string}/${command.input["Key"] as string}`;
        const stored = fakeStore.get(key);
        fakeGet(command.input);
        if (!stored) {
          const err = new Error("NoSuchKey") as Error & {
            name: string;
            $metadata?: { httpStatusCode: number };
          };
          err.name = "NoSuchKey";
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return {
          Body: {
            transformToString: async () => stored.body,
          },
          ContentType: stored.contentType,
          ContentLength: Buffer.byteLength(stored.body, "utf-8"),
        };
      }
      if (command.__type === "HeadObject") {
        const key = `${command.input["Bucket"] as string}/${command.input["Key"] as string}`;
        const stored = fakeStore.get(key);
        fakeHead(command.input);
        if (!stored) {
          const err = new Error("NotFound") as Error & {
            name: string;
            $metadata?: { httpStatusCode: number };
          };
          err.name = "NotFound";
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return {
          ContentLength: Buffer.byteLength(stored.body, "utf-8"),
          Metadata: stored.metadata ?? {},
          ETag: '"etag-fake"',
        };
      }
      throw new Error(`unhandled command: ${(command as FakeCommand).__type}`);
    }
  }
  class PutObjectCommand {
    public readonly __type = "PutObject" as const;
    constructor(public readonly input: Record<string, unknown>) {}
  }
  class GetObjectCommand {
    public readonly __type = "GetObject" as const;
    constructor(public readonly input: Record<string, unknown>) {}
  }
  class HeadObjectCommand {
    public readonly __type = "HeadObject" as const;
    constructor(public readonly input: Record<string, unknown>) {}
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(
    async (
      _client: unknown,
      command: FakeCommand,
      opts: { expiresIn?: number },
    ): Promise<string> => {
      presignSpy(command, opts);
      const bucket = command.input["Bucket"] as string;
      const key = command.input["Key"] as string;
      const expires = opts?.expiresIn ?? 0;
      const verb = command.__type === "PutObject" ? "put" : "get";
      return `https://minio.local/${bucket}/${key}?X-Amz-Expires=${expires}&verb=${verb}`;
    },
  ),
}));

// Imports must come AFTER `vi.mock` so the module graph resolves to the
// mocks rather than the real SDK packages.
import {
  _resetS3ClientForTests,
  checkUploadIntegrity,
  getStorageEnv,
  headObject,
  getObject,
  putObject,
  signDownloadUrl,
  signUploadUrl,
} from "../storage.js";

beforeEach(() => {
  fakeStore.clear();
  fakePut.mockClear();
  fakeGet.mockClear();
  fakeHead.mockClear();
  presignSpy.mockClear();
  sendSpy.mockClear();
  _resetS3ClientForTests();
});

describe("getStorageEnv", () => {
  it("falls back to local-dev defaults when env vars are missing", () => {
    const prevEndpoint = process.env["S3_ENDPOINT"];
    delete process.env["S3_ENDPOINT"];
    try {
      const env = getStorageEnv();
      expect(env.endpoint).toBe("http://localhost:9000");
      expect(env.buckets.submissions).toBe("researchcrafters-submissions");
      expect(env.buckets.runs).toBe("researchcrafters-runs");
    } finally {
      if (prevEndpoint !== undefined) process.env["S3_ENDPOINT"] = prevEndpoint;
    }
  });
});

describe("signUploadUrl", () => {
  it("returns a URL containing the bucket, key, and expiry", async () => {
    const { uploadUrl, headers } = await signUploadUrl({
      bucket: "researchcrafters-submissions",
      key: "submissions/sub-123/bundle.tar",
      expiresIn: 600,
      contentType: "application/octet-stream",
    });
    expect(uploadUrl).toContain("researchcrafters-submissions");
    expect(uploadUrl).toContain("submissions/sub-123/bundle.tar");
    expect(uploadUrl).toContain("X-Amz-Expires=600");
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(presignSpy).toHaveBeenCalledTimes(1);
  });

  it("respects the contentLengthRange advisory", async () => {
    const { headers } = await signUploadUrl({
      bucket: "b",
      key: "k",
      contentLengthRange: { min: 0, max: 50 * 1024 * 1024 },
    });
    expect(headers["X-Amz-Content-Length-Range-Max"]).toBe(
      String(50 * 1024 * 1024),
    );
    expect(headers["X-Amz-Content-Length-Range-Min"]).toBe("0");
  });

  it("defaults expiry to 600 seconds when omitted", async () => {
    const { uploadUrl } = await signUploadUrl({ bucket: "b", key: "k" });
    expect(uploadUrl).toContain("X-Amz-Expires=600");
  });
});

describe("signDownloadUrl", () => {
  it("returns a presigned GET URL", async () => {
    const url = await signDownloadUrl({
      bucket: "researchcrafters-runs",
      key: "runs/run-9/log.ndjson",
      expiresIn: 300,
    });
    expect(url).toContain("verb=get");
    expect(url).toContain("X-Amz-Expires=300");
    expect(url).toContain("runs/run-9/log.ndjson");
  });
});

describe("putObject + headObject", () => {
  it("round-trips body and metadata through the mock store", async () => {
    await putObject({
      bucket: "researchcrafters-submissions",
      key: "submissions/sub-1/bundle.tar",
      body: new Uint8Array([1, 2, 3]),
      contentType: "application/octet-stream",
      metadata: { sha256: "abc123" },
    });
    expect(fakePut).toHaveBeenCalledTimes(1);
    expect(fakePut.mock.calls[0]?.[0]).toMatchObject({
      Bucket: "researchcrafters-submissions",
      Key: "submissions/sub-1/bundle.tar",
      ContentType: "application/octet-stream",
      Metadata: { sha256: "abc123" },
    });
  });

  it("parses sha256 from x-amz-meta-sha256", async () => {
    await putObject({
      bucket: "b",
      key: "k",
      body: "hello",
      metadata: { sha256: "DEADBEEF" },
    });
    const head = await headObject({ bucket: "b", key: "k" });
    expect(head.exists).toBe(true);
    expect(head.sha256).toBe("deadbeef");
    expect(head.size).toBe(5);
    expect(head.etag).toBe("etag-fake");
  });

  it("returns exists=false for a missing object (NotFound)", async () => {
    const head = await headObject({ bucket: "b", key: "missing" });
    expect(head.exists).toBe(false);
    expect(head.sha256).toBeUndefined();
  });
});

describe("getObject", () => {
  it("reads back the body as a UTF-8 string", async () => {
    await putObject({
      bucket: "researchcrafters-runs",
      key: "runs/run-9/log.ndjson",
      body:
        '{"ts":"2026-05-07T00:00:00.000Z","severity":"info","text":"hello"}\n' +
        '{"ts":"2026-05-07T00:00:01.000Z","severity":"warn","text":"warn"}',
      contentType: "application/x-ndjson",
    });
    const result = await getObject({
      bucket: "researchcrafters-runs",
      key: "runs/run-9/log.ndjson",
    });
    expect(result.body).toContain('"severity":"info"');
    expect(result.body).toContain('"severity":"warn"');
    expect(result.contentType).toBe("application/x-ndjson");
  });
});

// ---------------------------------------------------------------------------
// Finalize route helper: integrity checks
// ---------------------------------------------------------------------------

describe("checkUploadIntegrity", () => {
  it("returns null when reported sha + bytes match the stored object meta", () => {
    const result = checkUploadIntegrity({
      reported: { sha256: "abcdef".padEnd(64, "0"), bytes: 100 },
      recorded: { sha256: "abcdef".padEnd(64, "0"), bytes: 100 },
      head: {
        exists: true,
        sha256: "abcdef".padEnd(64, "0"),
        size: 100,
      },
    });
    expect(result).toBeNull();
  });

  it("rejects a sha256 mismatch against the object meta", () => {
    const result = checkUploadIntegrity({
      reported: { sha256: "a".repeat(64), bytes: 50 },
      recorded: { sha256: null, bytes: null },
      head: {
        exists: true,
        sha256: "b".repeat(64),
        size: 50,
      },
    });
    expect(result?.error).toBe("sha256_mismatch");
    expect(result?.status).toBe(400);
  });

  it("rejects a sha256 mismatch against the recorded row when meta is absent", () => {
    const result = checkUploadIntegrity({
      reported: { sha256: "a".repeat(64), bytes: 50 },
      recorded: { sha256: "c".repeat(64), bytes: 50 },
      head: { exists: true, size: 50 },
    });
    expect(result?.error).toBe("sha256_mismatch");
  });

  it("rejects a byte-size mismatch against the object size", () => {
    const result = checkUploadIntegrity({
      reported: { sha256: "a".repeat(64), bytes: 99 },
      recorded: { sha256: null, bytes: null },
      head: {
        exists: true,
        sha256: "a".repeat(64),
        size: 100,
      },
    });
    expect(result?.error).toBe("byte_size_mismatch");
    expect(result?.status).toBe(400);
  });

  it("returns object_not_found when MinIO has no object at the key", () => {
    const result = checkUploadIntegrity({
      reported: { sha256: "a".repeat(64), bytes: 1 },
      recorded: { sha256: null, bytes: null },
      head: { exists: false },
    });
    expect(result?.error).toBe("object_not_found");
  });
});
