// Contract tests for the shared CLI <-> web schema. These run inside the web
// app's vitest project; the CLI side has its own contract test that imports
// the same module via a relative path so payload drift breaks both sides.

import { describe, expect, it } from "vitest";
import {
  cliVersionResponseSchema,
  deviceCodeRequestSchema,
  deviceCodeResponseSchema,
  deviceTokenRequestSchema,
  deviceTokenResponseSchema,
  enrollRequestSchema,
  enrollResponseSchema,
  mentorMessageRequestSchema,
  mentorMessageResponseSchema,
  revokeRequestSchema,
  revokeResponseSchema,
  runLogsResponseSchema,
  runStatusResponseSchema,
  submissionFinalizeRequestSchema,
  submissionFinalizeResponseSchema,
  submissionInitRequestSchema,
  submissionInitResponseSchema,
} from "../api-contract.js";

const SHA = "a".repeat(64);

describe("api-contract", () => {
  it("cli version response", () => {
    const ok = cliVersionResponseSchema.safeParse({ minCliVersion: "0.0.0" });
    expect(ok.success).toBe(true);
  });

  it("device code request accepts both casings", () => {
    expect(deviceCodeRequestSchema.safeParse({ clientId: "cli" }).success).toBe(
      true,
    );
    expect(
      deviceCodeRequestSchema.safeParse({ client_id: "cli" }).success,
    ).toBe(true);
    expect(
      deviceCodeRequestSchema.safeParse({ extra: "nope" }).success,
    ).toBe(false);
  });

  it("device code response shape", () => {
    const ok = deviceCodeResponseSchema.safeParse({
      deviceCode: "x".repeat(32),
      userCode: "ABCD-EFGH",
      verificationUri: "http://localhost:3000/auth/device",
      verificationUriComplete:
        "http://localhost:3000/auth/device?user_code=ABCD-EFGH",
      expiresIn: 600,
      interval: 5,
    });
    expect(ok.success).toBe(true);
  });

  it("device token request + responses", () => {
    expect(
      deviceTokenRequestSchema.safeParse({ deviceCode: "x" }).success,
    ).toBe(true);
    expect(
      deviceTokenRequestSchema.safeParse({ device_code: "x" }).success,
    ).toBe(true);
    expect(
      deviceTokenResponseSchema.safeParse({ error: "authorization_pending" })
        .success,
    ).toBe(true);
    expect(
      deviceTokenResponseSchema.safeParse({
        token: "session-token",
        expiresAt: new Date().toISOString(),
        email: "fixture@researchcrafters.dev",
      }).success,
    ).toBe(true);
    expect(
      deviceTokenResponseSchema.safeParse({ error: "no-such-error" }).success,
    ).toBe(false);
  });

  it("revoke request/response", () => {
    expect(
      revokeRequestSchema.safeParse({ token: "t" }).success,
    ).toBe(true);
    expect(
      revokeResponseSchema.safeParse({ revoked: true }).success,
    ).toBe(true);
  });

  it("enroll request/response", () => {
    expect(enrollRequestSchema.safeParse({}).success).toBe(true);
    expect(
      enrollResponseSchema.safeParse({
        enrollmentId: "enr-1",
        packageVersionId: "pv-1",
        firstStageRef: "S001",
      }).success,
    ).toBe(true);
  });

  it("submission init request/response", () => {
    expect(
      submissionInitRequestSchema.safeParse({
        stageRef: "S001",
        packageVersionId: "pv-1",
        fileCount: 3,
        byteSize: 1024,
        sha256: SHA,
      }).success,
    ).toBe(true);
    expect(
      submissionInitRequestSchema.safeParse({
        stageRef: "S001",
        packageVersionId: "pv-1",
        fileCount: 3,
        byteSize: 1024,
        sha256: "not-hex",
      }).success,
    ).toBe(false);
    expect(
      submissionInitResponseSchema.safeParse({
        submissionId: "sub-1",
        uploadUrl: "https://stub-storage.local/upload/sub-1",
        uploadHeaders: { "x-rc-submission-id": "sub-1" },
      }).success,
    ).toBe(true);
  });

  it("submission finalize request/response", () => {
    expect(
      submissionFinalizeRequestSchema.safeParse({
        uploadedSha256: SHA,
        uploadedBytes: 1024,
      }).success,
    ).toBe(true);
    expect(
      submissionFinalizeResponseSchema.safeParse({ runId: "run-1" }).success,
    ).toBe(true);
  });

  it("run status response", () => {
    const ok = runStatusResponseSchema.safeParse({
      id: "run-1",
      status: "queued",
    });
    expect(ok.success).toBe(true);
    const bad = runStatusResponseSchema.safeParse({
      id: "run-1",
      status: "weird",
    });
    expect(bad.success).toBe(false);
  });

  it("run logs response", () => {
    const ok = runLogsResponseSchema.safeParse({
      lines: [
        { ts: new Date().toISOString(), severity: "info", text: "hello" },
      ],
      nextCursor: "cur-1",
    });
    expect(ok.success).toBe(true);
    const empty = runLogsResponseSchema.safeParse({ lines: [] });
    expect(empty.success).toBe(true);
  });

  it("mentor messages request/response", () => {
    expect(
      mentorMessageRequestSchema.safeParse({
        enrollmentId: "enr-1",
        stageRef: "S001",
        mode: "hint",
        message: "stuck",
      }).success,
    ).toBe(true);
    expect(
      mentorMessageResponseSchema.safeParse({
        message: {
          id: "m-1",
          enrollmentId: "enr-1",
          stageRef: "S001",
          mode: "hint",
          role: "assistant",
          content: "...",
          createdAt: new Date().toISOString(),
        },
      }).success,
    ).toBe(true);
  });

  it("rejects malformed device-code request", () => {
    expect(
      deviceCodeRequestSchema.safeParse({ unexpected: 42 }).success,
    ).toBe(false);
  });
});
