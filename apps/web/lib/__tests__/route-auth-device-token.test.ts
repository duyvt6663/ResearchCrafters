import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Regression suite for `app/api/auth/device-token/route.ts`.
 *
 * Pins the four-state CLI polling protocol:
 *
 *   pending  → 202 { error: "authorization_pending" }
 *   approved → 200 { token, expiresAt, email }
 *   denied   → 400 { error: "access_denied" }
 *   expired  → 400 { error: "expired_token" }   (also for already-consumed flows)
 *
 * Plus the dev `developer_force_approve: true` short-circuit that mints
 * a session for the seed fixture user without a browser round-trip.
 *
 * `developer_force_approve` is the route's only path that can flip
 * `pending → approved` server-side. Pinning it under tests prevents an
 * accidental dev-only convenience from leaking into prod by a stray rule
 * change.
 */

const mocks = vi.hoisted(() => ({
  deviceCodeFindUnique: vi.fn(),
  deviceCodeUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  sessionCreate: vi.fn(),
  withQueryTimeout: vi.fn(),
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: {
    deviceCodeFlow: {
      findUnique: mocks.deviceCodeFindUnique,
      update: mocks.deviceCodeUpdate,
    },
    user: {
      findUnique: mocks.userFindUnique,
      findFirst: mocks.userFindFirst,
    },
    session: { create: mocks.sessionCreate },
  },
  withQueryTimeout: mocks.withQueryTimeout,
}));

import { POST } from "../../app/api/auth/device-token/route";

const ORIG_NODE_ENV = process.env["NODE_ENV"];

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.withQueryTimeout.mockImplementation(async (p) => p);
  mocks.deviceCodeUpdate.mockResolvedValue({ id: "flow-1" });
  mocks.sessionCreate.mockResolvedValue({ id: "sess-1" });
  // `process.env.NODE_ENV` is typed read-only by @types/node; cast to write.
  (process.env as Record<string, string | undefined>)["NODE_ENV"] = "development";
});

afterEach(() => {
  const env = process.env as Record<string, string | undefined>;
  if (ORIG_NODE_ENV === undefined) {
    delete env["NODE_ENV"];
  } else {
    env["NODE_ENV"] = ORIG_NODE_ENV;
  }
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/device-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const FUTURE = () => new Date(Date.now() + 600_000);
const PAST = () => new Date(Date.now() - 60_000);

describe("POST /api/auth/device-token", () => {
  it("returns 202 authorization_pending when the flow is still pending", async () => {
    mocks.deviceCodeFindUnique.mockResolvedValue({
      id: "flow-1",
      state: "pending",
      expiresAt: FUTURE(),
      userId: null,
      consumedAt: null,
    });
    const res = await POST(makeRequest({ deviceCode: "dc-pending" }));
    expect(res.status).toBe(202);
    expect(((await res.json()) as { error: string }).error).toBe(
      "authorization_pending",
    );
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });

  it("returns 400 access_denied when the flow is denied", async () => {
    mocks.deviceCodeFindUnique.mockResolvedValue({
      id: "flow-1",
      state: "denied",
      expiresAt: FUTURE(),
      userId: "u-1",
      consumedAt: null,
    });
    const res = await POST(makeRequest({ deviceCode: "dc-denied" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "access_denied",
    );
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });

  it("returns 400 expired_token when the flow has aged out", async () => {
    mocks.deviceCodeFindUnique.mockResolvedValue({
      id: "flow-1",
      state: "pending",
      expiresAt: PAST(),
      userId: null,
      consumedAt: null,
    });
    const res = await POST(makeRequest({ deviceCode: "dc-old" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "expired_token",
    );
    // The route should also flip state=expired for the row so future
    // polls don't keep recomputing.
    expect(mocks.deviceCodeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: "expired" }),
      }),
    );
  });

  it("refuses a second mint on an already-consumed flow", async () => {
    mocks.deviceCodeFindUnique.mockResolvedValue({
      id: "flow-1",
      state: "approved",
      expiresAt: FUTURE(),
      userId: "u-1",
      consumedAt: new Date(),
    });
    const res = await POST(makeRequest({ deviceCode: "dc-already-used" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "expired_token",
    );
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });

  it("mints a session on the approved happy path", async () => {
    mocks.deviceCodeFindUnique.mockResolvedValue({
      id: "flow-1",
      state: "approved",
      expiresAt: FUTURE(),
      userId: "u-1",
      consumedAt: null,
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "u-1",
      email: "fixture@researchcrafters.dev",
    });

    const res = await POST(makeRequest({ deviceCode: "dc-go" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThanOrEqual(20);
    expect(typeof body.expiresAt).toBe("string");
    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
    const sessArg = mocks.sessionCreate.mock.calls[0]?.[0];
    expect(sessArg?.data?.userId).toBe("u-1");
    expect(sessArg?.data?.expires).toBeInstanceOf(Date);
  });

  it("developer_force_approve flips a pending flow to approved + mints in dev mode", async () => {
    mocks.deviceCodeFindUnique.mockResolvedValue({
      id: "flow-1",
      state: "pending",
      expiresAt: FUTURE(),
      userId: null,
      consumedAt: null,
    });
    // Dev-force-approve looks the seed user up by email via findFirst,
    // THEN the approved-mint block looks them up again by id via findUnique.
    mocks.userFindFirst.mockResolvedValue({
      id: "u-fixture",
      email: "fixture@researchcrafters.dev",
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "u-fixture",
      email: "fixture@researchcrafters.dev",
    });

    const res = await POST(
      makeRequest({
        deviceCode: "dc-dev",
        developer_force_approve: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.deviceCodeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: "approved",
          userId: "u-fixture",
        }),
      }),
    );
    expect(mocks.sessionCreate).toHaveBeenCalled();
  });

  it("developer_force_approve is IGNORED outside dev mode (security stop)", async () => {
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = "production";
    mocks.deviceCodeFindUnique.mockResolvedValue({
      id: "flow-1",
      state: "pending",
      expiresAt: FUTURE(),
      userId: null,
      consumedAt: null,
    });

    const res = await POST(
      makeRequest({
        deviceCode: "dc-prod",
        developer_force_approve: true,
      }),
    );
    // Should fall through to the pending-state branch, NOT mint a session.
    expect(res.status).toBe(202);
    expect(((await res.json()) as { error: string }).error).toBe(
      "authorization_pending",
    );
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
    expect(mocks.deviceCodeUpdate).not.toHaveBeenCalled();
  });
});
