// Unit tests for the per-package mentor-budget-caps resolver. The
// implementation accepts an injected Prisma surface so the overlay rules
// can be exercised without a live database.

import { describe, expect, it, vi } from "vitest";

import {
  PackageVersionNotFoundError,
  resolveMentorBudgetCaps,
  type MentorBudgetCapsPrisma,
  type MentorBudgetCapsUsd,
} from "../src/mentor-budget-caps.js";

const DEFAULTS: MentorBudgetCapsUsd = {
  perUserDailyUsd: 5,
  perPackageUsd: 500,
  perStageUsd: 100,
};

function makePrisma(row: {
  mentorBudgetUserDailyUsd: number | null;
  mentorBudgetPackageUsd: number | null;
  mentorBudgetStageUsd: number | null;
} | null): { prisma: MentorBudgetCapsPrisma; findUnique: ReturnType<typeof vi.fn> } {
  const findUnique = vi.fn().mockResolvedValue(row);
  return {
    findUnique,
    prisma: {
      packageVersion: { findUnique },
    } as MentorBudgetCapsPrisma,
  };
}

describe("resolveMentorBudgetCaps", () => {
  it("returns defaults when every cap column is null", async () => {
    const { prisma, findUnique } = makePrisma({
      mentorBudgetUserDailyUsd: null,
      mentorBudgetPackageUsd: null,
      mentorBudgetStageUsd: null,
    });

    const caps = await resolveMentorBudgetCaps("pkg-v1", DEFAULTS, {
      prisma,
      withQueryTimeout: (p) => p,
    });

    expect(caps).toEqual(DEFAULTS);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "pkg-v1" },
      select: {
        mentorBudgetUserDailyUsd: true,
        mentorBudgetPackageUsd: true,
        mentorBudgetStageUsd: true,
      },
    });
  });

  it("overrides only the columns that are populated", async () => {
    const { prisma } = makePrisma({
      mentorBudgetUserDailyUsd: 7.5,
      mentorBudgetPackageUsd: null,
      mentorBudgetStageUsd: 42,
    });

    const caps = await resolveMentorBudgetCaps("pkg-v1", DEFAULTS, {
      prisma,
      withQueryTimeout: (p) => p,
    });

    expect(caps).toEqual({
      perUserDailyUsd: 7.5,
      perPackageUsd: 500,
      perStageUsd: 42,
    });
  });

  it("ignores non-positive or non-finite overrides and keeps the default", async () => {
    const { prisma } = makePrisma({
      mentorBudgetUserDailyUsd: 0,
      mentorBudgetPackageUsd: -10,
      mentorBudgetStageUsd: Number.NaN,
    });

    const caps = await resolveMentorBudgetCaps("pkg-v1", DEFAULTS, {
      prisma,
      withQueryTimeout: (p) => p,
    });

    expect(caps).toEqual(DEFAULTS);
  });

  it("throws PackageVersionNotFoundError when the row is missing", async () => {
    const { prisma } = makePrisma(null);

    await expect(
      resolveMentorBudgetCaps("missing", DEFAULTS, {
        prisma,
        withQueryTimeout: (p) => p,
      }),
    ).rejects.toBeInstanceOf(PackageVersionNotFoundError);
  });

  it("runs the lookup through the injected withQueryTimeout wrapper", async () => {
    const { prisma } = makePrisma({
      mentorBudgetUserDailyUsd: 9,
      mentorBudgetPackageUsd: null,
      mentorBudgetStageUsd: null,
    });
    const withQueryTimeout = vi.fn(<T>(p: Promise<T>): Promise<T> => p);

    await resolveMentorBudgetCaps("pkg-v1", DEFAULTS, {
      prisma,
      withQueryTimeout,
    });

    expect(withQueryTimeout).toHaveBeenCalledTimes(1);
  });
});
