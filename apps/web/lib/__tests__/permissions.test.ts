// Unit tests for the canAccess policy.
//
// We mock @researchcrafters/db so the tests exercise the policy logic without
// requiring a real Postgres instance. Each test seeds the four collaborator
// queries the policy reads (packageVersion, stage, membership, entitlements)
// with a deterministic payload.

import { describe, expect, it, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above any module-level `const`. Use
// `vi.hoisted` so the spies are declared at the same hoist level and
// the factory can reference them without a TDZ error.
const mocks = vi.hoisted(() => ({
  packageVersionFindUnique: vi.fn(),
  stageFindUnique: vi.fn(),
  membershipFindFirst: vi.fn(),
  entitlementFindMany: vi.fn(),
}));
const {
  packageVersionFindUnique,
  stageFindUnique,
  membershipFindFirst,
  entitlementFindMany,
} = mocks;

vi.mock("@researchcrafters/db", () => ({
  prisma: {
    packageVersion: { findUnique: mocks.packageVersionFindUnique },
    stage: { findUnique: mocks.stageFindUnique },
    membership: { findFirst: mocks.membershipFindFirst },
    entitlement: { findMany: mocks.entitlementFindMany },
  },
  withQueryTimeout: async <T>(p: PromiseLike<T>): Promise<T> => {
    return await p;
  },
}));

// Import after the mock so the policy resolves to the mocked module.
import { permissions } from "../permissions.js";
import type { Session } from "../auth.js";

const PV_ID = "pv-flash-attention";
const FREE_STAGE = "S001";
const PAID_STAGE = "S002";

const ANON: Session = { userId: null };
const FREE_USER: Session = { userId: "u-free" };
const PRO_USER: Session = { userId: "u-pro" };

function seedFreeStage(): void {
  packageVersionFindUnique.mockResolvedValue({
    releaseFreeStageIds: [FREE_STAGE],
  });
  stageFindUnique.mockResolvedValue({
    id: "stg-free-id",
    free: true,
    stageId: FREE_STAGE,
  });
}

function seedPaidStage(): void {
  packageVersionFindUnique.mockResolvedValue({
    releaseFreeStageIds: [FREE_STAGE],
  });
  stageFindUnique.mockResolvedValue({
    id: "stg-paid-id",
    free: false,
    stageId: PAID_STAGE,
  });
}

beforeEach(() => {
  packageVersionFindUnique.mockReset();
  stageFindUnique.mockReset();
  membershipFindFirst.mockReset();
  entitlementFindMany.mockReset();
});

describe("permissions.canAccess", () => {
  describe("free preview", () => {
    it("allows view_stage on a free preview stage for anonymous visitors", async () => {
      seedFreeStage();
      membershipFindFirst.mockResolvedValue(null);
      entitlementFindMany.mockResolvedValue([]);

      const result = await permissions.canAccess({
        user: ANON,
        packageVersionId: PV_ID,
        stage: { ref: FREE_STAGE, isFreePreview: true, isLocked: false },
        action: "view_stage",
      });

      expect(result).toEqual({ allowed: true });
    });

    it("allows view_stage on a free preview stage for an authenticated free user", async () => {
      seedFreeStage();
      membershipFindFirst.mockResolvedValue({
        plan: "free",
        status: "active",
      });
      entitlementFindMany.mockResolvedValue([]);

      const result = await permissions.canAccess({
        user: FREE_USER,
        packageVersionId: PV_ID,
        stage: { ref: FREE_STAGE, isFreePreview: true, isLocked: false },
        action: "view_stage",
      });

      expect(result).toEqual({ allowed: true });
    });
  });

  describe("paid stage entitlement", () => {
    it("denies view_stage on a paid stage when the user has no entitlement", async () => {
      seedPaidStage();
      membershipFindFirst.mockResolvedValue({
        plan: "free",
        status: "active",
      });
      entitlementFindMany.mockResolvedValue([]);

      const result = await permissions.canAccess({
        user: FREE_USER,
        packageVersionId: PV_ID,
        stage: { ref: PAID_STAGE, isFreePreview: false, isLocked: false },
        action: "view_stage",
      });

      expect(result).toEqual({
        allowed: false,
        reason: "no_entitlement",
      });
    });

    it("allows view_stage on a paid stage when the user has an explicit package entitlement", async () => {
      seedPaidStage();
      membershipFindFirst.mockResolvedValue({
        plan: "free",
        status: "active",
      });
      entitlementFindMany.mockResolvedValue([
        {
          scope: "package",
          packageVersionId: PV_ID,
          stageId: null,
          expiresAt: null,
        },
      ]);

      const result = await permissions.canAccess({
        user: FREE_USER,
        packageVersionId: PV_ID,
        stage: { ref: PAID_STAGE, isFreePreview: false, isLocked: false },
        action: "view_stage",
      });

      expect(result).toEqual({ allowed: true });
    });

    it("allows view_stage on a paid stage when the user is a pro member in good standing", async () => {
      seedPaidStage();
      membershipFindFirst.mockResolvedValue({
        plan: "pro",
        status: "active",
      });
      entitlementFindMany.mockResolvedValue([]);

      const result = await permissions.canAccess({
        user: PRO_USER,
        packageVersionId: PV_ID,
        stage: { ref: PAID_STAGE, isFreePreview: false, isLocked: false },
        action: "view_stage",
      });

      expect(result).toEqual({ allowed: true });
    });
  });

  describe("mentor requests", () => {
    it("denies request_mentor_hint for a free user without a mentor entitlement", async () => {
      seedFreeStage();
      membershipFindFirst.mockResolvedValue({
        plan: "free",
        status: "active",
      });
      entitlementFindMany.mockResolvedValue([]);

      const result = await permissions.canAccess({
        user: FREE_USER,
        packageVersionId: PV_ID,
        stage: { ref: FREE_STAGE, isFreePreview: true, isLocked: false },
        action: "request_mentor_hint",
      });

      expect(result).toEqual({
        allowed: false,
        reason: "no_entitlement",
      });
    });

    it("allows request_mentor_feedback for a user with an explicit mentor entitlement", async () => {
      seedFreeStage();
      membershipFindFirst.mockResolvedValue({
        plan: "free",
        status: "active",
      });
      entitlementFindMany.mockResolvedValue([
        {
          scope: "mentor",
          packageVersionId: null,
          stageId: null,
          expiresAt: null,
        },
      ]);

      const result = await permissions.canAccess({
        user: FREE_USER,
        packageVersionId: PV_ID,
        stage: { ref: FREE_STAGE, isFreePreview: true, isLocked: false },
        action: "request_mentor_feedback",
      });

      expect(result).toEqual({ allowed: true });
    });
  });

  describe("view_solution gating", () => {
    it("denies view_solution on a locked paid stage even for an authenticated user without entitlement", async () => {
      seedPaidStage();
      membershipFindFirst.mockResolvedValue({
        plan: "free",
        status: "active",
      });
      entitlementFindMany.mockResolvedValue([]);

      const result = await permissions.canAccess({
        user: FREE_USER,
        packageVersionId: PV_ID,
        stage: { ref: PAID_STAGE, isFreePreview: false, isLocked: true },
        action: "view_solution",
      });

      expect(result.allowed).toBe(false);
      if (result.allowed) return;
      expect(result.reason).toBe("stage_locked");
    });

    it("denies view_solution on a free preview stage (canonical solutions never leak)", async () => {
      seedFreeStage();
      membershipFindFirst.mockResolvedValue({
        plan: "free",
        status: "active",
      });
      entitlementFindMany.mockResolvedValue([]);

      const result = await permissions.canAccess({
        user: FREE_USER,
        packageVersionId: PV_ID,
        stage: { ref: FREE_STAGE, isFreePreview: true, isLocked: false },
        action: "view_solution",
      });

      expect(result).toEqual({
        allowed: false,
        reason: "no_entitlement",
      });
    });

    it("allows view_solution for a pro member", async () => {
      seedPaidStage();
      membershipFindFirst.mockResolvedValue({
        plan: "pro",
        status: "active",
      });
      entitlementFindMany.mockResolvedValue([]);

      const result = await permissions.canAccess({
        user: PRO_USER,
        packageVersionId: PV_ID,
        stage: { ref: PAID_STAGE, isFreePreview: false, isLocked: false },
        action: "view_solution",
      });

      expect(result).toEqual({ allowed: true });
    });
  });

  describe("default-deny for unknown actions", () => {
    it("returns unknown_action for an action outside the contract", async () => {
      const result = await permissions.canAccess({
        user: FREE_USER,
        packageVersionId: PV_ID,
        stage: { ref: FREE_STAGE, isFreePreview: true, isLocked: false },
        // @ts-expect-error -- intentional out-of-contract action
        action: "delete_universe",
      });

      expect(result).toEqual({
        allowed: false,
        reason: "unknown_action",
      });
    });
  });
});
