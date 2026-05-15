/**
 * S3-compatible object storage helper.
 *
 * Wraps `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` so the rest of
 * the web app can talk to MinIO (in dev) or any other S3-compatible backend
 * (e.g. AWS S3 in prod) without re-deriving SDK glue at every call site.
 *
 * Env-var contract (matches `.env.example`):
 *   - `S3_ENDPOINT`         e.g. `http://localhost:9000` for MinIO
 *   - `S3_REGION`           optional, defaults to `us-east-1` (MinIO ignores)
 *   - `S3_ACCESS_KEY`       MinIO root user / IAM access key id
 *   - `S3_SECRET_KEY`       MinIO root password / IAM secret access key
 *   - `S3_BUCKET_SUBMISSIONS`
 *   - `S3_BUCKET_RUNS`
 *   - `S3_BUCKET_PACKAGES`
 *   - `S3_BUCKET_SHARE_CARDS`
 *
 * MinIO compatibility requires `forcePathStyle: true` (virtual-hosted-style
 * URLs assume a DNS-resolvable bucket subdomain that MinIO doesn't provide
 * locally). The factory always sets that flag on.
 *
 * All functions accept an injected client so tests can drive a fake. Production
 * callers omit the client and get the lazy singleton.
 *
 * Run.metricsJson logs convention
 * --------------------------------
 * Two log storage shapes coexist:
 *   1. INLINE: `Run.metricsJson.logs` is a `StoredLogLine[]`. Suitable for
 *      short runs (test mode, replay) where the full log fits comfortably in
 *      JSONB. The runner callback writes this directly.
 *   2. OBJECT KEY: `Run.logObjectKey` is set, pointing at an
 *      `application/x-ndjson` blob in the runs bucket. Each line is a JSON
 *      object `{ ts, severity, text }`. Suitable for long mini-experiment
 *      runs where the volume would push the row over JSONB-friendly sizes.
 *
 * `runs/[id]/logs/route.ts` reads both: inline first, then falls back to
 * object-key fetch if no inline payload exists.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---------------------------------------------------------------------------
// Config + client singleton
// ---------------------------------------------------------------------------

export type StorageEnv = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  buckets: {
    submissions: string;
    runs: string;
    packages: string;
    shareCards: string;
  };
};

function readEnv(): StorageEnv {
  // We read process.env lazily so tests that override env vars before
  // importing the module pick up the right values.
  const env = process.env;
  return {
    endpoint: env["S3_ENDPOINT"] ?? "http://localhost:9000",
    region: env["S3_REGION"] ?? "us-east-1",
    accessKeyId: env["S3_ACCESS_KEY"] ?? "researchcrafters",
    secretAccessKey: env["S3_SECRET_KEY"] ?? "researchcrafters",
    buckets: {
      submissions:
        env["S3_BUCKET_SUBMISSIONS"] ?? "researchcrafters-submissions",
      runs: env["S3_BUCKET_RUNS"] ?? "researchcrafters-runs",
      packages: env["S3_BUCKET_PACKAGES"] ?? "researchcrafters-packages",
      shareCards:
        env["S3_BUCKET_SHARE_CARDS"] ?? "researchcrafters-share-cards",
    },
  };
}

export function getStorageEnv(): StorageEnv {
  return readEnv();
}

let cachedClient: S3Client | null = null;

/**
 * Lazy singleton S3 client configured for MinIO compatibility.
 *
 * Reads env on first call; subsequent calls return the cached client. Tests
 * that need a different config should pass a constructed client directly
 * to the helper functions instead of relying on the singleton.
 */
export function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  const env = readEnv();
  const config: S3ClientConfig = {
    region: env.region,
    endpoint: env.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  };
  cachedClient = new S3Client(config);
  return cachedClient;
}

/**
 * Test-only: drop the cached client so the next `getS3Client()` reads the
 * current env again. Not exported in production code paths.
 */
export function _resetS3ClientForTests(): void {
  cachedClient = null;
}

// ---------------------------------------------------------------------------
// signUploadUrl
// ---------------------------------------------------------------------------

export type SignUploadUrlInput = {
  bucket: string;
  key: string;
  expiresIn?: number;
  contentType?: string;
  /**
   * Optional advisory min/max byte range. We can't enforce this on a presigned
   * PUT directly (that requires POST policy or a signed-headers contract), so
   * the value is currently passed through as a `Content-Length` upper bound
   * via the returned `headers` map. The CLI honours it during the upload.
   */
  contentLengthRange?: { min?: number; max?: number };
  /** Override the default S3 client. Tests inject a fake here. */
  client?: S3Client;
};

export type SignUploadUrlResult = {
  uploadUrl: string;
  headers: Record<string, string>;
};

/**
 * Generate a presigned PUT URL the CLI can upload directly to.
 *
 * The returned `headers` map contains advisory headers the caller should
 * include with the PUT (Content-Type when supplied, Content-Length-Range
 * advisory). Headers that participate in the signature are part of the URL
 * itself — callers do NOT need to re-sign them.
 */
export async function signUploadUrl(
  input: SignUploadUrlInput,
): Promise<SignUploadUrlResult> {
  const client = input.client ?? getS3Client();
  const expiresIn = input.expiresIn ?? 600;

  // Build the PutObjectCommand with only the fields the caller supplied.
  // Under exactOptionalPropertyTypes, leaving fields off entirely is the
  // cleanest way to keep the input type happy.
  const params: PutObjectCommandInput = {
    Bucket: input.bucket,
    Key: input.key,
  };
  if (input.contentType) {
    params.ContentType = input.contentType;
  }
  const command = new PutObjectCommand(params);
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });

  const headers: Record<string, string> = {};
  if (input.contentType) {
    headers["Content-Type"] = input.contentType;
  }
  const max = input.contentLengthRange?.max;
  if (typeof max === "number" && Number.isFinite(max) && max > 0) {
    headers["X-Amz-Content-Length-Range-Max"] = String(Math.floor(max));
  }
  const min = input.contentLengthRange?.min;
  if (typeof min === "number" && Number.isFinite(min) && min >= 0) {
    headers["X-Amz-Content-Length-Range-Min"] = String(Math.floor(min));
  }
  return { uploadUrl, headers };
}

// ---------------------------------------------------------------------------
// signDownloadUrl
// ---------------------------------------------------------------------------

export type SignDownloadUrlInput = {
  bucket: string;
  key: string;
  expiresIn?: number;
  client?: S3Client;
};

/**
 * Generate a presigned GET URL for a stored object (run logs, share-card
 * images, etc.). Default expiry is 10 minutes — short enough that a leaked
 * URL ages out quickly, long enough for the CLI's poll loop and a CDN cache
 * miss.
 */
export async function signDownloadUrl(
  input: SignDownloadUrlInput,
): Promise<string> {
  const client = input.client ?? getS3Client();
  const expiresIn = input.expiresIn ?? 600;
  const command = new GetObjectCommand({
    Bucket: input.bucket,
    Key: input.key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

// ---------------------------------------------------------------------------
// headObject
// ---------------------------------------------------------------------------

export type HeadObjectInput = {
  bucket: string;
  key: string;
  client?: S3Client;
};

export type HeadObjectResult = {
  exists: boolean;
  /** sha256 hex string, when the uploader set the `x-amz-meta-sha256` header. */
  sha256?: string;
  /** Object size in bytes, when reported. */
  size?: number;
  /**
   * ETag, opaque on the server side. For unencrypted single-part uploads this
   * is an MD5 hex string we can use as a best-effort fallback when no meta
   * sha256 was stored. Multi-part / SSE-C uploads return synthetic ETags so
   * this is *not* a reliable content hash in general.
   */
  etag?: string;
};

/**
 * Look up object metadata. Returns `{ exists: false }` for `NotFound` /
 * `NoSuchKey` / 404 responses; rethrows all other errors so callers can
 * distinguish "missing" from "MinIO is down".
 */
export async function headObject(
  input: HeadObjectInput,
): Promise<HeadObjectResult> {
  const client = input.client ?? getS3Client();
  try {
    const command = new HeadObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    });
    const response = await client.send(command);
    const result: HeadObjectResult = { exists: true };
    const meta = (response.Metadata ?? {}) as Record<string, string>;
    // S3 lower-cases user-defined metadata keys on the way back; the
    // `x-amz-meta-` prefix is stripped by the SDK so we read the suffix only.
    const metaSha = meta["sha256"] ?? meta["Sha256"] ?? meta["SHA256"];
    if (typeof metaSha === "string" && metaSha.length > 0) {
      result.sha256 = metaSha.toLowerCase();
    }
    const size = response.ContentLength;
    if (typeof size === "number" && Number.isFinite(size) && size >= 0) {
      result.size = size;
    }
    if (typeof response.ETag === "string" && response.ETag.length > 0) {
      // ETag values are wrapped in double quotes by S3.
      result.etag = response.ETag.replace(/^"|"$/g, "");
    }
    return result;
  } catch (err: unknown) {
    if (isNotFoundError(err)) {
      return { exists: false };
    }
    throw err;
  }
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  if (e.name === "NotFound" || e.name === "NoSuchKey") return true;
  if (e.Code === "NotFound" || e.Code === "NoSuchKey") return true;
  const status = e.$metadata?.httpStatusCode;
  if (status === 404) return true;
  return false;
}

// ---------------------------------------------------------------------------
// putObject
// ---------------------------------------------------------------------------

export type PutObjectInput = {
  bucket: string;
  key: string;
  body: Uint8Array | string | Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
  client?: S3Client;
};

/**
 * Upload an object directly from the server (share-card image render,
 * scrubbed log files, anything that doesn't go through the presigned-PUT
 * path). For large bodies prefer streaming uploads via the SDK directly.
 */
export async function putObject(input: PutObjectInput): Promise<void> {
  const client = input.client ?? getS3Client();
  const params: PutObjectCommandInput = {
    Bucket: input.bucket,
    Key: input.key,
    Body: input.body,
  };
  if (input.contentType) {
    params.ContentType = input.contentType;
  }
  if (input.metadata && Object.keys(input.metadata).length > 0) {
    params.Metadata = input.metadata;
  }
  await client.send(new PutObjectCommand(params));
}

// ---------------------------------------------------------------------------
// getObject (server-side fetch)
// ---------------------------------------------------------------------------

export type GetObjectInput = {
  bucket: string;
  key: string;
  client?: S3Client;
};

export type GetObjectResult = {
  body: string;
  contentType?: string;
  size?: number;
};

/**
 * Server-side fetch: pull an object's body into memory as a UTF-8 string.
 *
 * Used by the run-logs route to read the line-delimited-JSON log file
 * referenced by `Run.logObjectKey`. For binary or unbounded payloads, prefer
 * piping the SDK stream directly — this helper is only safe for moderate
 * text payloads (we cap at 8 MiB to keep accidental misuse from oom-ing the
 * Node process).
 */
const MAX_GET_OBJECT_BYTES = 8 * 1024 * 1024;

export async function getObject(
  input: GetObjectInput,
): Promise<GetObjectResult> {
  const client = input.client ?? getS3Client();
  const command = new GetObjectCommand({
    Bucket: input.bucket,
    Key: input.key,
  });
  const response = await client.send(command);
  const body = response.Body;
  if (!body) {
    return { body: "" };
  }
  // The SDK adds a `transformToString` helper on the Body. Older versions
  // expose a Web ReadableStream; we fall back to manual concat in that case.
  const maybe = body as unknown as {
    transformToString?: (encoding?: string) => Promise<string>;
  };
  let text: string;
  if (typeof maybe.transformToString === "function") {
    text = await maybe.transformToString("utf-8");
  } else {
    text = await streamToString(body);
  }
  if (text.length > MAX_GET_OBJECT_BYTES) {
    text = text.slice(0, MAX_GET_OBJECT_BYTES);
  }
  const out: GetObjectResult = { body: text };
  if (typeof response.ContentType === "string") {
    out.contentType = response.ContentType;
  }
  if (typeof response.ContentLength === "number") {
    out.size = response.ContentLength;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Submission upload integrity check
// ---------------------------------------------------------------------------

export type FinalizeMismatch = {
  error: "object_not_found" | "sha256_mismatch" | "byte_size_mismatch";
  expected?: string | number;
  status: number;
};

/**
 * Compare a client's reported upload metadata against both the row's recorded
 * values (from submission init) and what S3 / MinIO has on disk.
 *
 * Returns `null` on match; otherwise the first mismatch found.
 *
 * Lives here (rather than inside the finalize route) so it can be unit-tested
 * without dragging the whole Next.js route module graph into the test.
 */
export function checkUploadIntegrity(args: {
  reported: { sha256: string; bytes: number };
  recorded: { sha256: string | null; bytes: number | null };
  head: HeadObjectResult;
}): FinalizeMismatch | null {
  if (!args.head.exists) {
    return { error: "object_not_found", status: 400 };
  }
  const reportedSha = args.reported.sha256.toLowerCase();
  const objectSha = args.head.sha256?.toLowerCase();
  if (objectSha && objectSha !== reportedSha) {
    return { error: "sha256_mismatch", expected: objectSha, status: 400 };
  }
  if (
    args.recorded.sha256 &&
    args.recorded.sha256.length > 0 &&
    args.recorded.sha256.toLowerCase() !== reportedSha
  ) {
    return {
      error: "sha256_mismatch",
      expected: args.recorded.sha256,
      status: 400,
    };
  }
  if (
    typeof args.head.size === "number" &&
    args.head.size !== args.reported.bytes
  ) {
    return {
      error: "byte_size_mismatch",
      expected: args.head.size,
      status: 400,
    };
  }
  if (
    typeof args.recorded.bytes === "number" &&
    args.recorded.bytes > 0 &&
    args.recorded.bytes !== args.reported.bytes
  ) {
    return {
      error: "byte_size_mismatch",
      expected: args.recorded.bytes,
      status: 400,
    };
  }
  return null;
}

async function streamToString(body: unknown): Promise<string> {
  // Best-effort fallback for environments that don't expose
  // `transformToString` on the SDK's Body object. We treat the value as an
  // async iterable yielding Uint8Array chunks.
  const iterable = body as AsyncIterable<Uint8Array> | undefined;
  if (!iterable || typeof iterable[Symbol.asyncIterator] !== "function") {
    return "";
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of iterable) {
    chunks.push(chunk);
    total += chunk.byteLength;
    if (total > MAX_GET_OBJECT_BYTES) break;
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export type DeleteObjectInput = {
  bucket: string;
  key: string;
  client?: S3Client;
};

export async function deleteObject(input: DeleteObjectInput): Promise<void> {
  const client = input.client ?? getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: input.bucket, Key: input.key }));
}
