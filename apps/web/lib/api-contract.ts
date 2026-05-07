/**
 * Shared CLI <-> web API contract.
 *
 * Single source of truth for the request/response payload shapes that
 * `packages/cli` exchanges with `apps/web`. Both sides import (or, for the CLI
 * test, file-read) this module so contract drift breaks CI.
 *
 * Conventions:
 *  - Every endpoint has a `*RequestSchema` and `*ResponseSchema` pair, even when
 *    the request body is empty (use `z.object({})`). This keeps the wire shape
 *    grep-able across both sides.
 *  - Inferred TypeScript types are re-exported with the `Type` suffix so call
 *    sites can import `EnrollResponse` rather than digging into the schema.
 *  - All schemas are `.strict()` where reasonable. We want unknown fields to
 *    surface, not to be silently accepted.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// /api/cli/version
// ---------------------------------------------------------------------------

export const cliVersionResponseSchema = z
  .object({
    minCliVersion: z.string().min(1),
    serverVersion: z.string().min(1).optional(),
  })
  .strict();
export type CliVersionResponse = z.infer<typeof cliVersionResponseSchema>;

// ---------------------------------------------------------------------------
// /api/auth/device-code (POST)
// ---------------------------------------------------------------------------

export const deviceCodeRequestSchema = z
  .object({
    clientId: z.string().min(1).optional(),
    // Some CLI builds send `client_id` (snake_case from RFC 8628). We accept
    // either; the route handler normalises to `clientId`.
    client_id: z.string().min(1).optional(),
  })
  .strict();
export type DeviceCodeRequest = z.infer<typeof deviceCodeRequestSchema>;

export const deviceCodeResponseSchema = z
  .object({
    deviceCode: z.string().min(1),
    userCode: z.string().min(1),
    verificationUri: z.string().url(),
    verificationUriComplete: z.string().url().optional(),
    expiresIn: z.number().int().positive(),
    interval: z.number().int().positive(),
  })
  .strict();
export type DeviceCodeResponse = z.infer<typeof deviceCodeResponseSchema>;

// ---------------------------------------------------------------------------
// /api/auth/device-token (POST)
// ---------------------------------------------------------------------------

export const deviceTokenRequestSchema = z
  .object({
    deviceCode: z.string().min(1).optional(),
    // RFC 8628 uses snake_case; tolerate it on the wire too.
    device_code: z.string().min(1).optional(),
    /**
     * Dev-only short-circuit: when running with NODE_ENV=development the
     * server treats this flag as immediate user-approval against the seed
     * fixture user. See JSDoc on the device-token route for details.
     */
    developer_force_approve: z.boolean().optional(),
  })
  .strict();
export type DeviceTokenRequest = z.infer<typeof deviceTokenRequestSchema>;

export const deviceTokenErrorSchema = z.enum([
  "authorization_pending",
  "slow_down",
  "expired_token",
  "access_denied",
]);
export type DeviceTokenError = z.infer<typeof deviceTokenErrorSchema>;

export const deviceTokenResponseSchema = z
  .object({
    token: z.string().min(1).optional(),
    refreshToken: z.string().min(1).optional(),
    expiresAt: z.string().datetime().optional(),
    email: z.string().email().nullable().optional(),
    error: deviceTokenErrorSchema.optional(),
  })
  .strict();
export type DeviceTokenResponse = z.infer<typeof deviceTokenResponseSchema>;

// ---------------------------------------------------------------------------
// /api/auth/revoke (POST)
// ---------------------------------------------------------------------------

export const revokeRequestSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();
export type RevokeRequest = z.infer<typeof revokeRequestSchema>;

export const revokeResponseSchema = z
  .object({
    revoked: z.boolean(),
  })
  .strict();
export type RevokeResponse = z.infer<typeof revokeResponseSchema>;

// ---------------------------------------------------------------------------
// /api/packages/[slug]/enroll (POST)
// ---------------------------------------------------------------------------

export const enrollRequestSchema = z.object({}).strict();
export type EnrollRequest = z.infer<typeof enrollRequestSchema>;

export const enrollResponseSchema = z
  .object({
    enrollmentId: z.string().min(1),
    packageVersionId: z.string().min(1),
    firstStageRef: z.string().min(1),
  })
  .strict();
export type EnrollResponse = z.infer<typeof enrollResponseSchema>;

// ---------------------------------------------------------------------------
// /api/submissions (POST) — submission init
// ---------------------------------------------------------------------------

export const submissionInitRequestSchema = z
  .object({
    stageAttemptId: z.string().min(1).optional(),
    stageRef: z.string().min(1),
    packageVersionId: z.string().min(1),
    fileCount: z.number().int().nonnegative(),
    byteSize: z.number().int().nonnegative(),
    sha256: z
      .string()
      .min(64)
      .max(64)
      .regex(/^[0-9a-f]{64}$/i, "expected lowercase hex sha256"),
  })
  .strict();
export type SubmissionInitRequest = z.infer<typeof submissionInitRequestSchema>;

export const submissionInitResponseSchema = z
  .object({
    submissionId: z.string().min(1),
    uploadUrl: z.string().min(1),
    uploadHeaders: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export type SubmissionInitResponse = z.infer<
  typeof submissionInitResponseSchema
>;

// ---------------------------------------------------------------------------
// /api/submissions/[id]/finalize (POST)
// ---------------------------------------------------------------------------

export const submissionFinalizeRequestSchema = z
  .object({
    uploadedSha256: z
      .string()
      .min(64)
      .max(64)
      .regex(/^[0-9a-f]{64}$/i, "expected lowercase hex sha256"),
    uploadedBytes: z.number().int().nonnegative(),
  })
  .strict();
export type SubmissionFinalizeRequest = z.infer<
  typeof submissionFinalizeRequestSchema
>;

export const submissionFinalizeResponseSchema = z
  .object({
    runId: z.string().min(1),
  })
  .strict();
export type SubmissionFinalizeResponse = z.infer<
  typeof submissionFinalizeResponseSchema
>;

// ---------------------------------------------------------------------------
// /api/runs/[id] (GET)
// ---------------------------------------------------------------------------

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "ok",
  "timeout",
  "oom",
  "crash",
  "exit_nonzero",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runStatusResponseSchema = z
  .object({
    id: z.string().min(1),
    status: runStatusSchema,
    startedAt: z.string().datetime().nullable().optional(),
    finishedAt: z.string().datetime().nullable().optional(),
    executionStatus: runStatusSchema.optional(),
    logUrl: z.string().nullable().optional(),
  })
  .strict();
export type RunStatusResponse = z.infer<typeof runStatusResponseSchema>;

// ---------------------------------------------------------------------------
// /api/runs/[id]/logs (GET)
// ---------------------------------------------------------------------------

export const runLogLineSchema = z
  .object({
    ts: z.string().datetime(),
    severity: z.enum(["debug", "info", "warn", "error"]),
    text: z.string(),
  })
  .strict();
export type RunLogLine = z.infer<typeof runLogLineSchema>;

export const runLogsResponseSchema = z
  .object({
    lines: z.array(runLogLineSchema),
    nextCursor: z.string().min(1).optional(),
  })
  .strict();
export type RunLogsResponse = z.infer<typeof runLogsResponseSchema>;

// ---------------------------------------------------------------------------
// /api/mentor/messages (POST)
// ---------------------------------------------------------------------------

export const mentorMessageRequestSchema = z
  .object({
    enrollmentId: z.string().min(1),
    stageRef: z.string().min(1),
    mode: z.enum(["hint", "clarify", "review_draft", "explain_branch"]),
    message: z.string().min(1),
  })
  .strict();
export type MentorMessageRequest = z.infer<typeof mentorMessageRequestSchema>;

export const mentorMessageResponseSchema = z
  .object({
    message: z
      .object({
        id: z.string().min(1),
        enrollmentId: z.string().min(1),
        stageRef: z.string().min(1),
        mode: z.enum(["hint", "clarify", "review_draft", "explain_branch"]),
        role: z.string().min(1),
        content: z.string(),
        createdAt: z.union([z.string(), z.date()]),
      })
      .strict(),
  })
  .strict();
export type MentorMessageResponse = z.infer<typeof mentorMessageResponseSchema>;

// ---------------------------------------------------------------------------
// Constant served from /api/cli/version. Bump when an old CLI must be refused.
// ---------------------------------------------------------------------------

export const MIN_CLI_VERSION = "0.0.0";
