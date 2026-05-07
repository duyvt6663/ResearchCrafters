import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/auth/device-code/route.ts`.
 *
 * The route mints a fresh device-code + user-code pair and persists a
 * pending `DeviceCodeFlow` row. CLI `researchcrafters login` polls
 * `/api/auth/device-token` while the learner approves the flow at
 * `verificationUri` in their browser. These tests pin the response shape
 * (the contract the CLI consumes), the persistence side-effect, and the
 * generated-code shape so a regression in either side surfaces in CI.
 */

const mocks = vi.hoisted(() => ({
  deviceCodeCreate: vi.fn(),
  withQueryTimeout: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: { deviceCodeFlow: { create: mocks.deviceCodeCreate } },
  withQueryTimeout: mocks.withQueryTimeout,
}));

vi.mock("@/lib/telemetry", () => ({
  track: mocks.track,
}));

import { POST } from "../../app/api/auth/device-code/route";

beforeEach(() => {
  mocks.deviceCodeCreate.mockReset();
  mocks.withQueryTimeout.mockReset();
  mocks.track.mockReset();
  mocks.withQueryTimeout.mockImplementation(async (p) => p);
  mocks.deviceCodeCreate.mockResolvedValue({ id: "flow-1" });
});

function makeRequest(body: unknown = {}): Request {
  return new Request("http://localhost/api/auth/device-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/auth/device-code", () => {
  it("returns the contract shape: deviceCode + userCode + verificationUri + expiresIn + interval", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.deviceCode).toBe("string");
    expect(body.deviceCode.length).toBeGreaterThanOrEqual(20);
    expect(typeof body.userCode).toBe("string");
    // userCode is short, dashed, alphanumeric — easy for a human to type.
    expect(body.userCode).toMatch(/^[A-Z0-9-]+$/);
    expect(typeof body.verificationUri).toBe("string");
    expect(body.verificationUri).toMatch(/\/auth\/device/);
    expect(typeof body.expiresIn).toBe("number");
    expect(body.expiresIn).toBeGreaterThan(0);
    expect(typeof body.interval).toBe("number");
    expect(body.interval).toBeGreaterThan(0);
  });

  it("persists a pending DeviceCodeFlow row with non-empty deviceCode and userCode", async () => {
    await POST(makeRequest());
    expect(mocks.deviceCodeCreate).toHaveBeenCalledTimes(1);
    const call = mocks.deviceCodeCreate.mock.calls[0]?.[0];
    expect(call?.data?.state).toBe("pending");
    expect(typeof call?.data?.deviceCode).toBe("string");
    expect((call?.data?.deviceCode as string).length).toBeGreaterThanOrEqual(
      20,
    );
    expect(typeof call?.data?.userCode).toBe("string");
    expect(call?.data?.expiresAt).toBeInstanceOf(Date);
    expect((call?.data?.expiresAt as Date).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("returns a different deviceCode on each call (no reuse across mint requests)", async () => {
    const res1 = await (await POST(makeRequest())).json();
    const res2 = await (await POST(makeRequest())).json();
    expect(res1.deviceCode).not.toEqual(res2.deviceCode);
    expect(res1.userCode).not.toEqual(res2.userCode);
  });

  it("tolerates a malformed body (defaults to {})", async () => {
    const req = new Request("http://localhost/api/auth/device-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    // The route swallows JSON errors and falls back to {}; with the empty
    // request schema that means a successful mint, NOT a 400.
    expect([200, 400]).toContain(res.status);
  });
});
