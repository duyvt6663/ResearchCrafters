// Unit tests for the active-patch-seq resolver. The implementation accepts
// an injected Prisma surface so the aggregate behaviour can be exercised
// without a live database.

import { describe, expect, it, vi } from "vitest";

import {
  resolveActivePatchSeq,
  type ActivePatchSeqPrisma,
} from "../src/active-patch-seq.js";

function makePrisma(max: number | null): {
  prisma: ActivePatchSeqPrisma;
  aggregate: ReturnType<typeof vi.fn>;
} {
  const aggregate = vi
    .fn()
    .mockResolvedValue({ _max: { patchSeq: max } });
  return {
    aggregate,
    prisma: {
      packageVersionPatch: { aggregate },
    } as ActivePatchSeqPrisma,
  };
}

describe("resolveActivePatchSeq", () => {
  it("returns 0 when no patches exist (aggregate _max is null)", async () => {
    const { prisma, aggregate } = makePrisma(null);

    const seq = await resolveActivePatchSeq("pv-1", {
      prisma,
      withQueryTimeout: (p) => p,
    });

    expect(seq).toBe(0);
    expect(aggregate).toHaveBeenCalledWith({
      where: { packageVersionId: "pv-1" },
      _max: { patchSeq: true },
    });
  });

  it("returns the highest patchSeq when patches exist", async () => {
    const { prisma } = makePrisma(7);

    const seq = await resolveActivePatchSeq("pv-1", {
      prisma,
      withQueryTimeout: (p) => p,
    });

    expect(seq).toBe(7);
  });

  it("clamps negative or non-finite values to 0 defensively", async () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { prisma } = makePrisma(bad);
      const seq = await resolveActivePatchSeq("pv-1", {
        prisma,
        withQueryTimeout: (p) => p,
      });
      expect(seq).toBe(0);
    }
  });

  it("floors fractional values so the column stays integer-valued", async () => {
    const { prisma } = makePrisma(3.9);

    const seq = await resolveActivePatchSeq("pv-1", {
      prisma,
      withQueryTimeout: (p) => p,
    });

    expect(seq).toBe(3);
  });

  it("runs the lookup through the injected withQueryTimeout wrapper", async () => {
    const { prisma } = makePrisma(2);
    const withQueryTimeout = vi.fn(<T>(p: Promise<T>): Promise<T> => p);

    await resolveActivePatchSeq("pv-1", { prisma, withQueryTimeout });

    expect(withQueryTimeout).toHaveBeenCalledTimes(1);
  });
});
