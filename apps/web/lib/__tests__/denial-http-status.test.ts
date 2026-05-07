// Unit tests for `denialHttpStatus` — the helper that maps a typed
// PermissionDenialReason onto an HTTP status code for API routes that gate
// access via `permissions.canAccess`.
//
// Coverage gap (per qa-test-coverage report): the existing
// `permissions.test.ts` exercises `canAccess` outcomes but never asserts the
// status-code mapping. Routes rely on it to return 401 vs 403 vs 400; a typo
// here would silently leak into every gated route's status code.

import { describe, expect, it } from "vitest";

// Mock @researchcrafters/db so importing `permissions.ts` doesn't try to
// initialize Prisma — the helper under test does not touch the DB, but the
// module-level import does.
import { vi } from "vitest";
vi.mock("@researchcrafters/db", () => ({
  prisma: {},
  withQueryTimeout: async <T>(p: PromiseLike<T>): Promise<T> => p,
}));

import {
  denialHttpStatus,
  type PermissionDenialReason,
} from "../permissions.js";

describe("denialHttpStatus", () => {
  it("returns 401 for not_authenticated", () => {
    expect(denialHttpStatus("not_authenticated")).toBe(401);
  });

  it("returns 400 for unknown_action (default-deny / contract drift)", () => {
    expect(denialHttpStatus("unknown_action")).toBe(400);
  });

  it("returns 403 for stage_locked, no_entitlement, no_membership, policy_disallows", () => {
    const forbidden: PermissionDenialReason[] = [
      "stage_locked",
      "no_entitlement",
      "no_membership",
      "policy_disallows",
    ];
    for (const reason of forbidden) {
      expect(denialHttpStatus(reason), `reason=${reason}`).toBe(403);
    }
  });

  it("never returns a 2xx status (every denial must be 4xx)", () => {
    const reasons: PermissionDenialReason[] = [
      "not_authenticated",
      "stage_locked",
      "no_entitlement",
      "no_membership",
      "policy_disallows",
      "unknown_action",
    ];
    for (const reason of reasons) {
      const status = denialHttpStatus(reason);
      expect(status, `reason=${reason}`).toBeGreaterThanOrEqual(400);
      expect(status, `reason=${reason}`).toBeLessThan(500);
    }
  });
});
