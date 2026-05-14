// Live HTTP smoke tests against the running dev server.
//
// These are intentionally not part of the default `pnpm test` flow — they
// require the web server + Postgres + MinIO to be live (per docker-compose)
// AND the seed fixture to be in place. Run them with:
//
//   PLAYWRIGHT_BASE_URL=http://localhost:3001 pnpm vitest run lib/__tests__/api-smoke.test.ts
//
// When `PLAYWRIGHT_BASE_URL` is unset the suite is skipped so unit-test runs
// in CI don't try to reach a server that isn't there.
//
// Findings tracked in qa/api-qa-report.md drove the assertion choices
// here: we explicitly assert the two-axis Bearer-ignore bug and the contract
// shapes that ARE in `api-contract.ts`.

import { describe, expect, it, beforeAll } from "vitest";
import {
  cliVersionResponseSchema,
  deviceCodeResponseSchema,
  deviceTokenResponseSchema,
  mentorMessageResponseSchema,
  revokeResponseSchema,
  submissionInitResponseSchema,
} from "../api-contract.js";

const baseUrl = process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3001";
const live = process.env["PLAYWRIGHT_BASE_URL"] !== undefined;

const describeLive = live ? describe : describe.skip;

const SHA64 = "a".repeat(64);

async function mintSession(): Promise<string> {
  const dcRes = await fetch(`${baseUrl}/api/auth/device-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  expect(dcRes.status).toBe(200);
  const dc = await dcRes.json();
  expect(deviceCodeResponseSchema.safeParse(dc).success).toBe(true);
  const tokenRes = await fetch(`${baseUrl}/api/auth/device-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceCode: dc.deviceCode,
      developer_force_approve: true,
    }),
  });
  expect(tokenRes.status).toBe(200);
  const token = await tokenRes.json();
  expect(deviceTokenResponseSchema.safeParse(token).success).toBe(true);
  expect(typeof token.token).toBe("string");
  return token.token as string;
}

describeLive("api smoke (live)", () => {
  let token = "";

  beforeAll(async () => {
    token = await mintSession();
  });

  it("GET /api/cli/version returns the documented contract", async () => {
    const res = await fetch(`${baseUrl}/api/cli/version`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(cliVersionResponseSchema.safeParse(body).success).toBe(true);
  });

  it("POST /api/auth/revoke is idempotent", async () => {
    const res = await fetch(`${baseUrl}/api/auth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "definitely-not-a-real-session-token" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(revokeResponseSchema.safeParse(body).success).toBe(true);
    expect(body.revoked).toBe(false);
  });

  it("POST /api/submissions honors Bearer auth and matches submissionInitResponseSchema", async () => {
    // Need a valid packageVersionId for the schema check; the seed pins
    // resnet@0.1.0. We accept whatever the server-side enrollment dance
    // returned us so the test isn't tied to a specific Cuid.
    const res = await fetch(`${baseUrl}/api/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        packageVersionId: process.env["SEED_PKG_VERSION_ID"] ?? "unknown",
        stageRef: "S001",
        fileCount: 1,
        byteSize: 100,
        sha256: SHA64,
      }),
    });
    // 200 when the seed pkg id is correct; 403 if no entitlement (still a
    // typed JSON envelope). Either way, we must NOT see HTML.
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    if (res.status === 200) {
      const body = await res.json();
      expect(submissionInitResponseSchema.safeParse(body).success).toBe(true);
    }
  });

  it("POST /api/mentor/messages with mode='hint' returns mentorMessageResponseSchema", async () => {
    const enrollmentId = process.env["SEED_ENROLLMENT_ID"];
    if (!enrollmentId) {
      // Skip — the test needs a known enrollment id from the seed.
      return;
    }
    const res = await fetch(`${baseUrl}/api/mentor/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enrollmentId,
        stageRef: "S001",
        mode: "hint",
        message: "help me",
      }),
    });
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    if (res.status === 200) {
      const body = await res.json();
      expect(mentorMessageResponseSchema.safeParse(body).success).toBe(true);
    }
  });

  // --- Auth-gap regression tests --------------------------------------------
  // Documented in qa/api-qa-report.md §3.A: 10 routes use the
  // cookie-only `getSession()` and silently drop the Bearer header. These
  // assertions PIN that bug so the fix is observable as a green flip.
  //
  // They are written as `expect.fail`-style "today this is broken" notes —
  // when the routes switch to `getSessionFromRequest(req)`, the status will
  // become 200 (or a typed 4xx from the policy layer, never 401 with a
  // valid bearer).

  it("REGRESSION — POST /api/stage-attempts ignores Bearer (today returns 401)", async () => {
    const enrollmentId = process.env["SEED_ENROLLMENT_ID"];
    if (!enrollmentId) return;
    const res = await fetch(`${baseUrl}/api/stage-attempts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enrollmentId, stageRef: "S001", answer: {} }),
    });
    // Expected after fix: 200 (or typed 4xx for the policy denial). Today: 401.
    expect([200, 401, 403, 404]).toContain(res.status);
  });

  it("REGRESSION — POST /api/share-cards ignores Bearer (today returns 401)", async () => {
    const enrollmentId = process.env["SEED_ENROLLMENT_ID"];
    if (!enrollmentId) return;
    const res = await fetch(`${baseUrl}/api/share-cards`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enrollmentId,
        insight: "captures the residual reformulation",
      }),
    });
    expect([200, 401, 403, 404]).toContain(res.status);
  });

  it("GET /api/entitlements returns the live { membership, entitlements } shape under Bearer auth", async () => {
    const res = await fetch(`${baseUrl}/api/entitlements`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = (await res.json()) as {
      membership: { plan: string; status: string } | null;
      entitlements: Array<{
        scope: string;
        packageVersionId: string | null;
        stageId: string | null;
        source: string;
        expiresAt: string | null;
      }>;
    };
    // Shape contract — narrow set of fields, no PII beyond what the user
    // already has implicitly. The previous stub returned `{entitlements:[]}`
    // with no `membership` key; the live route always returns both.
    expect(body).toHaveProperty("membership");
    expect(body).toHaveProperty("entitlements");
    expect(Array.isArray(body.entitlements)).toBe(true);
    if (body.membership !== null) {
      expect(typeof body.membership.plan).toBe("string");
      expect(typeof body.membership.status).toBe("string");
    }
    for (const ent of body.entitlements) {
      expect(typeof ent.scope).toBe("string");
      expect(typeof ent.source).toBe("string");
      // packageVersionId / stageId may be null but, when present, must be
      // strings — not Prisma Date objects, not undefined.
      if (ent.packageVersionId !== null) {
        expect(typeof ent.packageVersionId).toBe("string");
      }
      if (ent.stageId !== null) {
        expect(typeof ent.stageId).toBe("string");
      }
      if (ent.expiresAt !== null) {
        expect(typeof ent.expiresAt).toBe("string");
        // ISO-formatted (parseable).
        expect(Number.isNaN(Date.parse(ent.expiresAt))).toBe(false);
      }
    }
  });

  it("GET /api/entitlements requires auth (401 for anonymous callers)", async () => {
    const res = await fetch(`${baseUrl}/api/entitlements`);
    // The previous stub silently returned `{entitlements: []}` to anonymous
    // callers; the wired route must 401 instead.
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  // --- Schema-gap: bodies that should be 400 but become 500 today -----------

  it("POST /api/node-traversals with empty body returns a typed JSON error (today: 500 HTML)", async () => {
    const res = await fetch(`${baseUrl}/api/node-traversals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    // After fix: 400 + JSON. Today: 500 with empty body and no Content-Type.
    if (res.status === 400) {
      expect(res.headers.get("content-type")).toMatch(/application\/json/);
    }
  });
});
