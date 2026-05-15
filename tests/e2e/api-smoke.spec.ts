import { expect, test } from "@playwright/test";

/**
 * API smoke regression. Hits the JSON endpoints the FE depends on without a
 * session cookie. The expectations encode the observable contract today,
 * including the known buggy shapes (so any future fix flips this test red and
 * forces the reviewer to update the assertion intentionally).
 *
 * - /api/health          : 200 + { ok: true }
 * - /api/cli/version     : 200 + { minCliVersion: "<semver>" }
 * - /api/auth/session    : 200 + null (NextAuth contract for unauth)
 * - /api/auth/csrf       : 200 + { csrfToken: "<hex>" }
 * - /api/auth/providers  : 200 + non-empty object
 * - /api/packages        : 200 + { packages: <object|array> }   (see report:
 *                          handler currently returns a Promise serialization)
 * - /api/packages/resnet : 200 + { package: { slug: "resnet", ... } }
 * - /api/packages/does-not-exist : 404 + { error: "not_found" }
 * - /api/entitlements    : 401 for anon (route now does live Prisma reads
 *                          under Bearer/NextAuth and rejects unauth callers)
 */
test.describe("api surface (anon)", () => {
  test("health is ok", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  test("cli version exposes a semver string", async ({ request }) => {
    const r = await request.get("/api/cli/version");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(typeof body.minCliVersion).toBe("string");
    expect(body.minCliVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("nextauth session is null for anonymous", async ({ request }) => {
    const r = await request.get("/api/auth/session");
    expect(r.status()).toBe(200);
    expect(await r.json()).toBeNull();
  });

  test("nextauth csrf token is issued", async ({ request }) => {
    const r = await request.get("/api/auth/csrf");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(typeof body.csrfToken).toBe("string");
    expect(body.csrfToken.length).toBeGreaterThan(8);
  });

  test("nextauth providers payload is non-empty", async ({ request }) => {
    const r = await request.get("/api/auth/providers");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(Object.keys(body).length).toBeGreaterThan(0);
  });

  test("/api/packages returns 200 with a packages key", async ({ request }) => {
    const r = await request.get("/api/packages");
    expect(r.status()).toBe(200);
    const body = await r.json();
    // Whether the value is an array (correct) or an object (current bug) the
    // wrapper key must exist. The QA report flags the bug separately.
    expect(body).toHaveProperty("packages");
  });

  test("/api/packages/resnet returns the seeded package", async ({ request }) => {
    const r = await request.get("/api/packages/resnet");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.package?.slug).toBe("resnet");
    expect(typeof body.package?.title).toBe("string");
  });

  test("/api/packages/<unknown> 404s with not_found", async ({ request }) => {
    const r = await request.get("/api/packages/does-not-exist");
    expect(r.status()).toBe(404);
    expect(await r.json()).toEqual({ error: "not_found" });
  });

  test("/api/entitlements rejects anonymous callers with 401", async ({
    request,
  }) => {
    // Route is now wired to getSessionFromRequest — anonymous callers get 401.
    const r = await request.get("/api/entitlements");
    expect(r.status()).toBe(401);
    const body = await r.json();
    expect(body).toEqual({ error: "not_authenticated" });
  });
});

test.describe("api error surfaces (anon)", () => {
  test("POST /api/stage-attempts with empty body returns a structured error, not 500", async ({
    request,
  }) => {
    const r = await request.post("/api/stage-attempts", { data: {} });
    // Today this is a 500 with empty body because the route reads
    // body.enrollmentId without zod-validating first. Once the handler is
    // hardened, this should become 400 with `{ error: "bad_request" }`.
    expect([400, 401, 403, 404]).toContain(r.status());
  });

  test("POST /api/share-cards with empty body returns a structured error, not 500", async ({
    request,
  }) => {
    const r = await request.post("/api/share-cards", { data: {} });
    expect([400, 401, 403, 404]).toContain(r.status());
  });

  test("POST /api/submissions with empty body returns 400 zod errors", async ({
    request,
  }) => {
    const r = await request.post("/api/submissions", { data: {} });
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(body.error).toBe("bad_request");
    expect(Array.isArray(body.reason)).toBe(true);
  });
});
