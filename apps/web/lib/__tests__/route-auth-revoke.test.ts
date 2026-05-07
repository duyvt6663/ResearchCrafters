import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/auth/revoke/route.ts`.
 *
 * Pins:
 *  - Body validation through `revokeRequestSchema` — missing / empty token
 *    returns structured `bad_request` 400 with zod issues.
 *  - Malformed JSON body falls back to `{}` and surfaces the same 400 path
 *    (no 500 vector).
 *  - Valid token + matching Session row → `prisma.session.deleteMany`
 *    returns `count: 1` → response `{ revoked: true }`.
 *  - Token that doesn't match any session → `count: 0` → idempotent
 *    `{ revoked: false }` (200, never 404).
 *  - The query is shape-pinned: `where: { sessionToken: <token> }` so
 *    a careless edit can't accidentally delete by `id` (which would let
 *    a known-token caller wipe somebody else's row).
 */

const mocks = vi.hoisted(() => ({
  sessionDeleteMany: vi.fn(),
  withQueryTimeout: vi.fn(),
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: {
    session: { deleteMany: mocks.sessionDeleteMany },
  },
  withQueryTimeout: mocks.withQueryTimeout,
}));

import { POST } from "../../app/api/auth/revoke/route";

beforeEach(() => {
  mocks.sessionDeleteMany.mockReset();
  mocks.withQueryTimeout.mockReset();
  // Identity wrapper so Prisma promises pass through.
  mocks.withQueryTimeout.mockImplementation(async (p) => p);
});

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/auth/revoke", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/auth/revoke", () => {
  it("returns 400 bad_request when the body is missing the token field", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(Array.isArray(body.reason)).toBe(true);
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("returns 400 bad_request when the token is an empty string", async () => {
    const res = await POST(makeRequest({ token: "" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "bad_request",
    );
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON body (route falls back to {} and zod rejects)", async () => {
    const req = new Request("http://localhost/api/auth/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("returns { revoked: true } when the session row is found and deleted", async () => {
    mocks.sessionDeleteMany.mockResolvedValue({ count: 1 });
    const res = await POST(makeRequest({ token: "tok-real" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ revoked: true });
    // Pin the WHERE shape — it MUST be sessionToken, never id.
    expect(mocks.sessionDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({
      where: { sessionToken: "tok-real" },
    });
  });

  it("returns { revoked: false } idempotently when no session row matches", async () => {
    mocks.sessionDeleteMany.mockResolvedValue({ count: 0 });
    const res = await POST(makeRequest({ token: "tok-already-gone" }));
    // Crucial: 200, not 404. The CLI's logout UX would otherwise misreport.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ revoked: false });
  });

  it("flows through withQueryTimeout (DB-timeout safety)", async () => {
    mocks.sessionDeleteMany.mockResolvedValue({ count: 1 });
    await POST(makeRequest({ token: "tok-x" }));
    expect(mocks.withQueryTimeout).toHaveBeenCalledTimes(1);
  });
});
