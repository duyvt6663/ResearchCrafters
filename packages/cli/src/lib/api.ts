import { request } from 'undici';
import { getState } from './config.js';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: 'Bearer';
}

export interface StartPackageResponse {
  packageSlug: string;
  packageVersionId: string;
  stageRef: string;
  starterUrl: string;
  apiUrl: string;
  smokeCommand?: string;
}

export interface SubmitInitResponse {
  submissionId: string;
  uploadUrl: string;
  expectedSha256?: string;
}

export interface RunStatusResponse {
  runId: string;
  status: 'queued' | 'running' | 'ok' | 'timeout' | 'oom' | 'crash' | 'exit_nonzero';
  logsUrl?: string;
  gradeId?: string;
}

export interface VersionInfoResponse {
  serverVersion: string;
  minCliVersion: string;
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
  if (status >= 400) {
    const obj = (parsed as { code?: string; message?: string } | undefined) ?? {};
    throw new ApiError(status, obj.code ?? 'http_error', obj.message ?? `HTTP ${status}`);
  }
  return parsed as T;
}

// Documented surface; all calls below are stubs against `RESEARCHCRAFTERS_API_URL`.

export const api = {
  async getVersionInfo(): Promise<VersionInfoResponse> {
    return call<VersionInfoResponse>('/api/cli/version', { auth: false });
  },

  // OAuth device code flow stub.
  async deviceCode(clientId: string): Promise<DeviceCodeResponse> {
    return call<DeviceCodeResponse>('/api/auth/device-code', {
      method: 'POST',
      body: { client_id: clientId },
      auth: false,
    });
  },

  async pollDeviceToken(deviceCode: string): Promise<TokenResponse> {
    return call<TokenResponse>('/api/auth/device-token', {
      method: 'POST',
      body: { device_code: deviceCode },
      auth: false,
    });
  },

  async revokeToken(token: string): Promise<void> {
    await call<void>('/api/auth/revoke', {
      method: 'POST',
      body: { token },
      auth: false,
    });
  },

  async startPackage(slug: string): Promise<StartPackageResponse> {
    return call<StartPackageResponse>(`/api/packages/${encodeURIComponent(slug)}/enroll`, {
      method: 'POST',
      body: {},
    });
  },

  async initSubmission(args: {
    packageSlug: string;
    stageRef: string;
    bundleSha256: string;
    bundleSizeBytes: number;
  }): Promise<SubmitInitResponse> {
    return call<SubmitInitResponse>('/api/submissions', {
      method: 'POST',
      body: args,
    });
  },

  async finalizeSubmission(submissionId: string): Promise<{ runId: string }> {
    return call<{ runId: string }>(`/api/submissions/${encodeURIComponent(submissionId)}/finalize`, {
      method: 'POST',
      body: {},
    });
  },

  async getRunStatus(runId: string): Promise<RunStatusResponse> {
    return call<RunStatusResponse>(`/api/runs/${encodeURIComponent(runId)}`);
  },

  async getRunLogs(runId: string): Promise<{ logs: string }> {
    return call<{ logs: string }>(`/api/runs/${encodeURIComponent(runId)}/logs`);
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
