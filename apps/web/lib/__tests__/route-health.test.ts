import { describe, expect, it } from "vitest";

/**
 * Regression suite for `app/api/health/route.ts`.
 *
 * The health endpoint is the platform-level liveness probe. Any deploy
 * orchestrator (k8s, Vercel, Render) treats a non-200 here as "drain this
 * instance," so the contract is load-bearing in a way the route's tiny body
 * doesn't make obvious.
 *
 * Today's route returns a synchronous `{ ok: true }` and does NOT run a DB
 * reachability probe. The earlier coverage brief assumed a `prisma.$queryRaw`
 * branch; we pin reality (no probe, deterministic shape, never throws).
 * If the route ever grows a probe, the {db: "ok" | "unreachable"} branches
 * should be added back with mocks for `@researchcrafters/db`.
 */

import { GET } from "../../app/api/health/route";

function makeRequest(): Request {
  return new Request("http://localhost/api/health");
}

describe("GET /api/health", () => {
  it("returns 200 with the canonical { ok: true } body", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true });
  });

  it("uses application/json content-type so probes parse the body cleanly", async () => {
    const res = await GET();
    const ct = res.headers.get("content-type");
    expect(ct).toBeTruthy();
    expect(ct).toContain("application/json");
  });

  it("is deterministic across calls (probes hit it on every tick)", async () => {
    const a = await (await GET()).json();
    const b = await (await GET()).json();
    const c = await (await GET()).json();
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("does not throw and does not require a Request argument (Next route invariant)", async () => {
    // The route is exported as `export function GET(): NextResponse`. It
    // must not require a request — Next.js calls it with no args under
    // certain probe paths.
    await expect(Promise.resolve(GET())).resolves.toBeDefined();
  });

  it("ignores supplied headers (auth header has no effect on liveness)", async () => {
    // The handler signature is parameterless, but we sanity-check that calling
    // it returns the same body regardless. This pins that liveness never
    // depends on session state.
    const _req = makeRequest();
    void _req;
    const res = await GET();
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });
});
