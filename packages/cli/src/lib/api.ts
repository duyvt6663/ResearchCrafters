import { request } from 'undici';
import { getState } from './config.js';

// CLI <-> web API surface. Payload shapes mirror
// `apps/web/lib/api-contract.ts` — the source of truth lives there and a
// contract test in `packages/cli/test/contract.test.ts` reads that file via a
// relative path so drift on either side breaks CI.

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
}

export type DeviceTokenError =
  | 'authorization_pending'
  | 'slow_down'
  | 'expired_token'
  | 'access_denied';

export interface DeviceTokenResponse {
  token?: string;
  refreshToken?: string;
  expiresAt?: string;
  email?: string | null;
  error?: DeviceTokenError;
}

export interface EnrollResponse {
  enrollmentId: string;
  packageVersionId: string;
  firstStageRef: string;
  starterUrl?: string;
  smokeCommand?: string;
}

/**
 * Workspace-resolution payload returned by `start <slug>`. Mirrors what the
 * `/api/packages/[slug]/enroll` route returns: contract fields plus optional
 * `starterUrl`/`smokeCommand` populated when a starter bundle has been seeded
 * for the package version (deterministic key
 * `starters/<slug>/<packageVersionId>.tar.gz` in the packages bucket).
 * Fields are `undefined` when storage isn't seeded yet — the CLI then
 * materializes an empty workspace.
 */
export interface StartPackageResponse {
  packageSlug: string;
  packageVersionId: string;
  stageRef: string;
  starterUrl?: string;
  smokeCommand?: string;
}

export interface SubmitInitRequest {
  stageAttemptId?: string;
  stageRef: string;
  packageVersionId: string;
  fileCount: number;
  byteSize: number;
  sha256: string;
}

export interface SubmitInitResponse {
  submissionId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
}

export interface SubmitFinalizeRequest {
  uploadedSha256: string;
  uploadedBytes: number;
}

export interface SubmitFinalizeResponse {
  runId: string;
}

export type RunStatus =
  | 'queued'
  | 'running'
  | 'ok'
  | 'timeout'
  | 'oom'
  | 'crash'
  | 'exit_nonzero';

export interface RunStatusResponse {
  id: string;
  status: RunStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  executionStatus?: RunStatus;
  logUrl?: string | null;
}

export interface RunLogLine {
  ts: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  text: string;
}

export interface RunLogsResponse {
  lines: RunLogLine[];
  nextCursor?: string;
}

export interface VersionInfoResponse {
  minCliVersion: string;
  serverVersion?: string;
}

const DEFAULT_API_URL = 'https://api.researchcrafters.dev';

export function apiUrl(): string {
  return process.env.RESEARCHCRAFTERS_API_URL || getState().apiUrl || DEFAULT_API_URL;
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function call<T>(pathname: string, opts: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    ...(opts.headers ?? {}),
  };
  if (opts.auth !== false) {
    const tok = getState().token;
    if (tok) headers.authorization = `Bearer ${tok}`;
  }
  const url = new URL(pathname, apiUrl()).toString();
  const res = await request(url, {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const status = res.statusCode;
  const text = await res.body.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  // 202 from /api/auth/device-token carries `{ error: 'authorization_pending' }`
  // — the CLI's login loop relies on that being raised as an ApiError so it
  // can keep polling. Treat any 4xx/5xx, plus the 202 polling response,
  // uniformly.
  const errorObj =
    parsed && typeof parsed === 'object'
      ? (parsed as { error?: string; reason?: unknown; message?: string })
      : undefined;
  if (status >= 400 || (status === 202 && errorObj?.error)) {
    const code = errorObj?.error ?? errorObj?.message ?? 'http_error';
    throw new ApiError(status, code, `HTTP ${status}: ${code}`);
  }
  return parsed as T;
}

// Documented surface; all calls below are stubs against `RESEARCHCRAFTERS_API_URL`.

export const api = {
  async getVersionInfo(): Promise<VersionInfoResponse> {
    return call<VersionInfoResponse>('/api/cli/version', { auth: false });
  },

  // OAuth device code flow.
  async deviceCode(clientId: string): Promise<DeviceCodeResponse> {
    return call<DeviceCodeResponse>('/api/auth/device-code', {
      method: 'POST',
      body: { clientId },
      auth: false,
    });
  },

  async pollDeviceToken(deviceCode: string): Promise<DeviceTokenResponse> {
    return call<DeviceTokenResponse>('/api/auth/device-token', {
      method: 'POST',
      body: { deviceCode },
      auth: false,
    });
  },

  async revokeToken(token: string): Promise<{ revoked: boolean }> {
    return call<{ revoked: boolean }>('/api/auth/revoke', {
      method: 'POST',
      body: { token },
      auth: false,
    });
  },

  async startPackage(slug: string): Promise<StartPackageResponse> {
    // The web /enroll route returns a back-compat envelope: the contract
    // fields are at the top level (enrollmentId, packageVersionId,
    // firstStageRef, optional starterUrl, optional smokeCommand) and the
    // legacy `enrollment` object carries `packageSlug` / `activeStageRef`.
    // `starterUrl`/`smokeCommand` are populated only when the package has a
    // seeded starter bundle and a manifest-level smoke command respectively.
    type Envelope = EnrollResponse & {
      enrollment?: {
        id: string;
        packageSlug: string;
        packageVersionId: string;
        activeStageRef: string | null;
      };
    };
    const env = await call<Envelope>(`/api/packages/${encodeURIComponent(slug)}/enroll`, {
      method: 'POST',
      body: {},
    });
    const out: StartPackageResponse = {
      packageSlug: env.enrollment?.packageSlug ?? slug,
      packageVersionId: env.packageVersionId,
      stageRef: env.firstStageRef,
    };
    if (env.starterUrl) out.starterUrl = env.starterUrl;
    if (env.smokeCommand) out.smokeCommand = env.smokeCommand;
    return out;
  },

  async initSubmission(args: SubmitInitRequest): Promise<SubmitInitResponse> {
    return call<SubmitInitResponse>('/api/submissions', {
      method: 'POST',
      body: args,
    });
  },

  async finalizeSubmission(
    submissionId: string,
    args: SubmitFinalizeRequest,
  ): Promise<SubmitFinalizeResponse> {
    return call<SubmitFinalizeResponse>(
      `/api/submissions/${encodeURIComponent(submissionId)}/finalize`,
      {
        method: 'POST',
        body: args,
      },
    );
  },

  async getRunStatus(runId: string): Promise<RunStatusResponse> {
    return call<RunStatusResponse>(`/api/runs/${encodeURIComponent(runId)}`);
  },

  async getRunLogs(runId: string, cursor?: string): Promise<RunLogsResponse> {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return call<RunLogsResponse>(`/api/runs/${encodeURIComponent(runId)}/logs${q}`);
  },

  async uploadToSignedUrl(signedUrl: string, body: Buffer): Promise<void> {
    const res = await request(signedUrl, {
      method: 'PUT',
      body,
      headers: { 'content-type': 'application/octet-stream' },
    });
    await res.body.dump();
    if (res.statusCode >= 400) {
      throw new ApiError(res.statusCode, 'upload_failed', `Upload failed: HTTP ${res.statusCode}`);
    }
  },

  async downloadSignedUrl(signedUrl: string): Promise<Buffer> {
    const res = await request(signedUrl, { method: 'GET' });
    if (res.statusCode >= 400) {
      await res.body.dump();
      throw new ApiError(res.statusCode, 'download_failed', `Download failed: HTTP ${res.statusCode}`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of res.body) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  },
};
