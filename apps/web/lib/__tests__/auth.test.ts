// Unit tests for `getSession()` Bearer-token support.
//
// We mock `@researchcrafters/db` so the helper exercises the Bearer lookup
// without a live Postgres, and `@/auth` so the cookie fallback path is
// deterministic (the cookie path returns "no session" so we can isolate the
// Bearer behaviour).

import { describe, expect, it, vi, beforeEach } from "vitest";

const { sessionFindUnique } = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(),
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: {
    session: { findUnique: sessionFindUnique },
  },
  withQueryTimeout: async <T>(p: PromiseLike<T>): Promise<T> => {
    return await p;
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
}));

import { getSession, getSessionFromRequest } from "../auth.js";

beforeEach(() => {
  sessionFindUnique.mockReset();
});

function reqWithAuth(value: string | null): Request {
  return new Request("http://localhost/", {
    headers: value === null ? {} : { authorization: value },
  });
}

describe("getSession (Bearer support)", () => {
  it("returns the user when the Bearer token maps to a non-expired session", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    sessionFindUnique.mockResolvedValueOnce({
      expires: future,
      user: {
        id: "u-1",
        email: "fixture@example.com",
        name: "Fixture",
        image: null,
      },
    });
    const result = await getSession(reqWithAuth("Bearer good-token"));
    expect(result).toEqual({
      userId: "u-1",
      user: {
        id: "u-1",
        email: "fixture@example.com",
        name: "Fixture",
        image: null,
      },
    });
    expect(sessionFindUnique).toHaveBeenCalledWith({
      where: { sessionToken: "good-token" },
      select: expect.any(Object),
    });
  });

  it("returns null when the Bearer token's session has expired", async () => {
    const past = new Date(Date.now() - 60 * 1000);
    sessionFindUnique.mockResolvedValueOnce({
      expires: past,
      user: {
        id: "u-2",
        email: null,
        name: null,
        image: null,
      },
    });
    const result = await getSession(reqWithAuth("Bearer expired-token"));
    expect(result).toEqual({ userId: null, user: null });
  });

  it("returns null when the Bearer token is unknown", async () => {
    sessionFindUnique.mockResolvedValueOnce(null);
    const result = await getSession(reqWithAuth("Bearer unknown"));
    expect(result).toEqual({ userId: null, user: null });
  });

  it("returns null when the Authorization header is missing or malformed", async () => {
    const a = await getSession(reqWithAuth(null));
    expect(a).toEqual({ userId: null, user: null });

    const b = await getSession(reqWithAuth("Basic dXNlcjpwYXNz"));
    expect(b).toEqual({ userId: null, user: null });

    expect(sessionFindUnique).not.toHaveBeenCalled();
  });

  it("getSessionFromRequest is a thin wrapper around getSession", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    sessionFindUnique.mockResolvedValueOnce({
      expires: future,
      user: { id: "u-3", email: null, name: null, image: null },
    });
    const result = await getSessionFromRequest(reqWithAuth("Bearer t"));
    expect(result.userId).toBe("u-3");
  });
});
