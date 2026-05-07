// Unit tests for `anonymizedEmailFor` — the sentinel helper that produces
// the tombstone email written into a User row during account deletion.
//
// Coverage gap (per qa-test-coverage report): account-cascade.test.ts uses
// this helper as a comparator but doesn't assert the *format* properties
// that callers (and the db) rely on:
//   - RFC 6761 reserved `.invalid` TLD so the value never tries to deliver.
//   - Stable, deterministic per-userId so re-running the cascade is a no-op.
//   - Distinct per userId so two anonymized rows don't collide on UNIQUE.
//
// The helper has no external collaborators; we mock @researchcrafters/db
// only to keep the module-level import happy.

import { describe, expect, it, vi } from "vitest";

vi.mock("@researchcrafters/db", () => ({
  prisma: {},
  withQueryTimeout: async <T>(p: PromiseLike<T>): Promise<T> => p,
}));

import { anonymizedEmailFor } from "../account-cascade.js";

describe("anonymizedEmailFor", () => {
  it("returns a value ending in the RFC 6761 reserved `.invalid` TLD", () => {
    const email = anonymizedEmailFor("u-1");
    // RFC 6761: the `.invalid` TLD is permanently reserved for non-routable
    // sentinel addresses. Any change away from it would risk delivering mail
    // to a third party.
    expect(email).toMatch(/\.invalid$/);
  });

  it("contains the userId so audit logs can trace which row was scrubbed", () => {
    expect(anonymizedEmailFor("u-fixture")).toContain("u-fixture");
  });

  it("is deterministic (idempotent re-run produces the same tombstone)", () => {
    expect(anonymizedEmailFor("u-1")).toBe(anonymizedEmailFor("u-1"));
  });

  it("produces distinct values for distinct userIds", () => {
    expect(anonymizedEmailFor("u-1")).not.toBe(anonymizedEmailFor("u-2"));
  });

  it("matches a syntactically valid email-shape (single @, no whitespace)", () => {
    const email = anonymizedEmailFor("u-fixture");
    // Single '@'.
    expect(email.split("@")).toHaveLength(2);
    // No whitespace.
    expect(/\s/.test(email)).toBe(false);
    // Local part and domain non-empty.
    const [local, domain] = email.split("@");
    expect((local ?? "").length).toBeGreaterThan(0);
    expect((domain ?? "").length).toBeGreaterThan(0);
  });
});
