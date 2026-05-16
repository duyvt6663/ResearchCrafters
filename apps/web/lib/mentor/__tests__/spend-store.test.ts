import { describe, expect, it } from "vitest";
import {
  InMemoryMentorSpendStore,
  defaultMentorSpendStore,
  resetDefaultMentorSpendStoreForTests,
} from "../spend-store.js";

describe("InMemoryMentorSpendStore", () => {
  it("accumulates per-user spend within the sliding window", async () => {
    let now = 1_000_000;
    const store = new InMemoryMentorSpendStore({
      userDailyWindowMs: 60_000,
      now: () => now,
    });

    await store.recordSpend({
      userId: "u-1",
      packageId: "pkg-a",
      stageId: "S001",
      usd: 0.12,
    });
    await store.recordSpend({
      userId: "u-1",
      packageId: "pkg-a",
      stageId: "S001",
      usd: 0.08,
    });

    expect(await store.getUserDailySpendUsd("u-1")).toBeCloseTo(0.2, 5);
    expect(await store.getPackageSpendUsd("pkg-a")).toBeCloseTo(0.2, 5);
    expect(await store.getStageSpendUsd("pkg-a", "S001")).toBeCloseTo(0.2, 5);
    expect(await store.getUserDailySpendUsd("u-2")).toBe(0);
  });

  it("prunes per-user hits older than the window", async () => {
    let now = 1_000_000;
    const store = new InMemoryMentorSpendStore({
      userDailyWindowMs: 1000,
      now: () => now,
    });
    await store.recordSpend({
      userId: "u-1",
      packageId: "pkg",
      stageId: "S",
      usd: 1,
    });
    now += 2000;
    expect(await store.getUserDailySpendUsd("u-1")).toBe(0);
    // Package + stage totals are cumulative (no window) so they survive.
    expect(await store.getPackageSpendUsd("pkg")).toBe(1);
  });

  it("ignores non-positive usd amounts (no ledger entry)", async () => {
    const store = new InMemoryMentorSpendStore({ now: () => 1 });
    await store.recordSpend({
      userId: "u-1",
      packageId: "p",
      stageId: "s",
      usd: 0,
    });
    await store.recordSpend({
      userId: "u-1",
      packageId: "p",
      stageId: "s",
      usd: Number.NaN,
    });
    expect(await store.getUserDailySpendUsd("u-1")).toBe(0);
    expect(await store.getPackageSpendUsd("p")).toBe(0);
  });

  it("rejects non-positive windowMs at construction", () => {
    expect(() => new InMemoryMentorSpendStore({ userDailyWindowMs: 0 })).toThrowError(
      /windowMs must be positive/,
    );
  });

  it("defaultMentorSpendStore returns a process-wide singleton", () => {
    resetDefaultMentorSpendStoreForTests();
    const a = defaultMentorSpendStore();
    const b = defaultMentorSpendStore();
    expect(a).toBe(b);
    resetDefaultMentorSpendStoreForTests();
    const c = defaultMentorSpendStore();
    expect(c).not.toBe(a);
  });
});
