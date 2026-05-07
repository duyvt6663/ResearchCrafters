// CLI <-> web contract test.
//
// To avoid a runtime dependency from `packages/cli` on `apps/web` (which would
// produce a workspace cycle), this test reads the schema module from
// `apps/web/lib/api-contract.ts` via a relative file path and feeds it to a
// fresh `tsx`/esbuild loader at test time. Vitest+ts-node handle TypeScript
// transpilation, so we can `await import()` the file directly.
//
// The test is intentionally schema-driven: we build sample payloads matching
// the CLI request/response shapes and assert that the corresponding web Zod
// schema parses them. A negative case proves drift breaks the build.

import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_CONTRACT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'apps',
  'web',
  'lib',
  'api-contract.ts',
);

type ZodLikeResult = { success: true; data: unknown } | { success: false; error: unknown };
interface ZodLikeSchema {
  safeParse: (input: unknown) => ZodLikeResult;
}

interface Contract {
  cliVersionResponseSchema: ZodLikeSchema;
  deviceCodeRequestSchema: ZodLikeSchema;
  deviceCodeResponseSchema: ZodLikeSchema;
  deviceTokenRequestSchema: ZodLikeSchema;
  deviceTokenResponseSchema: ZodLikeSchema;
  revokeRequestSchema: ZodLikeSchema;
  revokeResponseSchema: ZodLikeSchema;
  enrollRequestSchema: ZodLikeSchema;
  enrollResponseSchema: ZodLikeSchema;
  submissionInitRequestSchema: ZodLikeSchema;
  submissionInitResponseSchema: ZodLikeSchema;
  submissionFinalizeRequestSchema: ZodLikeSchema;
  submissionFinalizeResponseSchema: ZodLikeSchema;
  runStatusResponseSchema: ZodLikeSchema;
  runLogsResponseSchema: ZodLikeSchema;
  mentorMessageRequestSchema: ZodLikeSchema;
  mentorMessageResponseSchema: ZodLikeSchema;
}

let contract: Contract;

async function loadContract(): Promise<Contract> {
  // Confirm the file exists (gives a nicer failure than a bare import error).
  await fs.access(API_CONTRACT_PATH);
  const mod = (await import(API_CONTRACT_PATH)) as Contract;
  return mod;
}

const SHA = 'a'.repeat(64);

describe('CLI <-> web API contract (drift guard)', () => {
  it('loads the shared contract module from apps/web/lib/api-contract.ts', async () => {
    contract = await loadContract();
    expect(contract.enrollResponseSchema).toBeDefined();
  });

  it('cli version response shape matches the CLI ApiClient', async () => {
    contract ??= await loadContract();
    const sample = { minCliVersion: '0.0.0' };
    expect(contract.cliVersionResponseSchema.safeParse(sample).success).toBe(true);
  });

  it('device-code request payload from login.ts parses', async () => {
    contract ??= await loadContract();
    expect(
      contract.deviceCodeRequestSchema.safeParse({ clientId: 'researchcrafters-cli' }).success,
    ).toBe(true);
  });

  it('device-code response from the server parses', async () => {
    contract ??= await loadContract();
    const sample = {
      deviceCode: 'x'.repeat(32),
      userCode: 'ABCD-EFGH',
      verificationUri: 'http://localhost:3000/auth/device',
      verificationUriComplete: 'http://localhost:3000/auth/device?user_code=ABCD-EFGH',
      expiresIn: 600,
      interval: 5,
    };
    expect(contract.deviceCodeResponseSchema.safeParse(sample).success).toBe(true);
  });

  it('device-token request and response shapes parse', async () => {
    contract ??= await loadContract();
    expect(
      contract.deviceTokenRequestSchema.safeParse({ deviceCode: 'x' }).success,
    ).toBe(true);
    expect(
      contract.deviceTokenResponseSchema.safeParse({ error: 'authorization_pending' }).success,
    ).toBe(true);
    expect(
      contract.deviceTokenResponseSchema.safeParse({
        token: 'session-token',
        expiresAt: new Date().toISOString(),
        email: 'fixture@researchcrafters.dev',
      }).success,
    ).toBe(true);
  });

  it('revoke request/response shapes parse', async () => {
    contract ??= await loadContract();
    expect(contract.revokeRequestSchema.safeParse({ token: 't' }).success).toBe(true);
    expect(contract.revokeResponseSchema.safeParse({ revoked: true }).success).toBe(true);
  });

  it('enroll response from /api/packages/[slug]/enroll parses', async () => {
    contract ??= await loadContract();
    expect(
      contract.enrollResponseSchema.safeParse({
        enrollmentId: 'enr-1',
        packageVersionId: 'pv-1',
        firstStageRef: 'S001',
      }).success,
    ).toBe(true);
  });

  it('submission init request from CLI submit parses', async () => {
    contract ??= await loadContract();
    expect(
      contract.submissionInitRequestSchema.safeParse({
        stageRef: 'S001',
        packageVersionId: 'pv-1',
        fileCount: 3,
        byteSize: 1024,
        sha256: SHA,
      }).success,
    ).toBe(true);
    expect(
      contract.submissionInitResponseSchema.safeParse({
        submissionId: 'sub-1',
        uploadUrl: 'https://stub-storage.local/upload/sub-1',
        uploadHeaders: { 'x-rc-submission-id': 'sub-1' },
      }).success,
    ).toBe(true);
  });

  it('submission finalize request/response shapes parse', async () => {
    contract ??= await loadContract();
    expect(
      contract.submissionFinalizeRequestSchema.safeParse({
        uploadedSha256: SHA,
        uploadedBytes: 1024,
      }).success,
    ).toBe(true);
    expect(
      contract.submissionFinalizeResponseSchema.safeParse({ runId: 'run-1' }).success,
    ).toBe(true);
  });

  it('run status response from /api/runs/[id] parses', async () => {
    contract ??= await loadContract();
    expect(
      contract.runStatusResponseSchema.safeParse({
        id: 'run-1',
        status: 'queued',
      }).success,
    ).toBe(true);
    // CLI's `RunStatus` union must match the server's status enum.
    for (const s of ['queued', 'running', 'ok', 'timeout', 'oom', 'crash', 'exit_nonzero']) {
      expect(
        contract.runStatusResponseSchema.safeParse({ id: 'run-1', status: s }).success,
      ).toBe(true);
    }
  });

  it('run logs response from /api/runs/[id]/logs parses', async () => {
    contract ??= await loadContract();
    expect(
      contract.runLogsResponseSchema.safeParse({
        lines: [{ ts: new Date().toISOString(), severity: 'info', text: 'hello' }],
        nextCursor: '1',
      }).success,
    ).toBe(true);
    expect(contract.runLogsResponseSchema.safeParse({ lines: [] }).success).toBe(true);
  });

  it('mentor message request/response shapes parse', async () => {
    contract ??= await loadContract();
    expect(
      contract.mentorMessageRequestSchema.safeParse({
        enrollmentId: 'enr-1',
        stageRef: 'S001',
        mode: 'hint',
        message: 'stuck',
      }).success,
    ).toBe(true);
    expect(
      contract.mentorMessageResponseSchema.safeParse({
        message: {
          id: 'm-1',
          enrollmentId: 'enr-1',
          stageRef: 'S001',
          mode: 'hint',
          role: 'assistant',
          content: '...',
          createdAt: new Date().toISOString(),
        },
      }).success,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // CLI-side surface assertions: every interface the CLI exposes that mirrors
  // a wire shape MUST be a strict subset of the contract schema. The
  // assertions below build an instance from the CLI's interface and feed it
  // back through the schema; if a CLI-only field sneaks in, the strict Zod
  // schema rejects it and CI flags the drift.
  // -------------------------------------------------------------------------

  it('CLI EnrollResponse fields are a strict subset of enrollResponseSchema', async () => {
    contract ??= await loadContract();
    // Build the response shape the CLI advertises. If a future change adds
    // a field here that isn't in `enrollResponseSchema.strict()`, this
    // assertion flips red.
    const cliShape: EnrollResponse = {
      enrollmentId: 'enr-1',
      packageVersionId: 'pv-1',
      firstStageRef: 'S001',
    };
    expect(contract.enrollResponseSchema.safeParse(cliShape).success).toBe(true);
    // The fields that used to live on EnrollResponse / StartPackageResponse
    // (`starterUrl`, `apiUrl`, `smokeCommand`) MUST now be rejected by the
    // strict schema if they leak back in.
    expect(
      contract.enrollResponseSchema.safeParse({
        ...cliShape,
        starterUrl: 'https://example.invalid/starter.tar',
      }).success,
    ).toBe(false);
    expect(
      contract.enrollResponseSchema.safeParse({
        ...cliShape,
        apiUrl: 'https://api.example.invalid',
      }).success,
    ).toBe(false);
    expect(
      contract.enrollResponseSchema.safeParse({
        ...cliShape,
        smokeCommand: 'pnpm test',
      }).success,
    ).toBe(false);
  });

  it('CLI RunStatusResponse consumed by `status` parses against the schema', async () => {
    contract ??= await loadContract();
    // The shapes the `status` command renders. Each must round-trip the
    // strict schema; missing optional fields are explicitly allowed.
    const queued: RunStatusResponse = {
      id: 'run-1',
      status: 'queued',
    };
    expect(contract.runStatusResponseSchema.safeParse(queued).success).toBe(true);

    const running: RunStatusResponse = {
      id: 'run-1',
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    expect(contract.runStatusResponseSchema.safeParse(running).success).toBe(true);

    const finished: RunStatusResponse = {
      id: 'run-1',
      status: 'ok',
      executionStatus: 'ok',
      startedAt: '2026-05-07T10:00:00.000Z',
      finishedAt: '2026-05-07T10:01:23.000Z',
      logUrl: 'https://example.invalid/logs/run-1',
    };
    expect(contract.runStatusResponseSchema.safeParse(finished).success).toBe(true);
  });

  it('rejects malformed payloads (drift guard)', async () => {
    contract ??= await loadContract();
    // sha256 must be 64 lowercase-hex chars.
    expect(
      contract.submissionInitRequestSchema.safeParse({
        stageRef: 'S001',
        packageVersionId: 'pv-1',
        fileCount: 3,
        byteSize: 1024,
        sha256: 'not-a-hash',
      }).success,
    ).toBe(false);
    // Unknown run status must fail.
    expect(
      contract.runStatusResponseSchema.safeParse({ id: 'run-1', status: 'wat' }).success,
    ).toBe(false);
    // Strict schemas should reject unknown keys.
    expect(
      contract.deviceCodeRequestSchema.safeParse({ extra: true }).success,
    ).toBe(false);
  });
});
