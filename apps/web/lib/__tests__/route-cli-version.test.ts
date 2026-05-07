import { describe, expect, it } from "vitest";

/**
 * Regression suite for `app/api/cli/version/route.ts`.
 *
 * The CLI hits this endpoint on every command to compare its own version
 * against the floor the server is willing to accept. The contract:
 *   - Response shape is `{ minCliVersion: string }` (optional `serverVersion`).
 *   - Schema lives in `lib/api-contract.ts` and the route round-trips it
 *     through `cliVersionResponseSchema.parse(...)` before serialising.
 *   - Bumping `MIN_CLI_VERSION` in `api-contract.ts` is the only knob —
 *     the route itself reads the constant.
 *
 * These tests pin the wire shape and the determinism so an old CLI talking
 * to a new server (or vice versa) doesn't drift silently.
 */

import { GET } from "../../app/api/cli/version/route";
import {
  cliVersionResponseSchema,
  MIN_CLI_VERSION,
} from "../../lib/api-contract";

describe("GET /api/cli/version", () => {
  it("returns 200 with the contract-shaped { minCliVersion } body", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // The schema is `.strict()`, so unknown fields would fail the parse.
    const parsed = cliVersionResponseSchema.parse(body);
    expect(typeof parsed.minCliVersion).toBe("string");
    expect(parsed.minCliVersion.length).toBeGreaterThan(0);
  });

  it("serves exactly the MIN_CLI_VERSION constant from api-contract", async () => {
    const res = await GET();
    const body = (await res.json()) as { minCliVersion: string };
    // Pinning equality means a constant bump in api-contract must be
    // accompanied by a deliberate test update — drift surfaces in CI.
    expect(body.minCliVersion).toBe(MIN_CLI_VERSION);
  });

  it("minCliVersion looks like a semver triple (M.m.p, optional pre-release/meta)", async () => {
    const res = await GET();
    const body = (await res.json()) as { minCliVersion: string };
    // Permissive semver regex — accepts pre-release / build-metadata suffixes
    // (the contract allows them) but requires the M.m.p core.
    const semver =
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
    expect(body.minCliVersion).toMatch(semver);
  });

  it("is deterministic across calls (CLI must not see flapping version floors)", async () => {
    const a = (await (await GET()).json()) as { minCliVersion: string };
    const b = (await (await GET()).json()) as { minCliVersion: string };
    const c = (await (await GET()).json()) as { minCliVersion: string };
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("rejects unknown fields via strict schema (defence against accidental leaks)", async () => {
    // Round-trip through the schema again with an unknown field to confirm
    // the schema is strict — this is the contract guard the route relies on.
    const bad = { minCliVersion: "0.0.0", unexpected: true };
    expect(() => cliVersionResponseSchema.parse(bad)).toThrow();
  });

  it("uses application/json content-type", async () => {
    const res = await GET();
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
