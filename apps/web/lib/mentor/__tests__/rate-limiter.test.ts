import { describe, expect, it } from "vitest";
import {
  InMemoryMentorRateLimiter,
  defaultMentorRateLimiter,
  resetDefaultMentorRateLimiterForTests,
} from "../rate-limiter.js";

describe("InMemoryMentorRateLimiter", () => {
  it("allows requests up to the per-user-package limit and then refuses", async () => {
    let now = 1_000_000;
    const limiter = new InMemoryMentorRateLimiter({
      perUserLimit: 100,
      perUserPackageLimit: 2,
      windowMs: 60_000,
      now: () => now,
    });

    expect(await limiter.check({ userId: "u-1", packageId: "p-a" })).toEqual({
      allowed: true,
    });
    expect(await limiter.check({ userId: "u-1", packageId: "p-a" })).toEqual({
      allowed: true,
    });
    const denied = await limiter.check({ userId: "u-1", packageId: "p-a" });
    expect(denied.allowed).toBe(false);
    if (denied.allowed) return;
    expect(denied.scope).toBe("per_user_package");
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("refuses on the per-user window when the per-pair window is loose", async () => {
    let now = 1_000_000;
    const limiter = new InMemoryMentorRateLimiter({
      perUserLimit: 2,
      perUserPackageLimit: 100,
      windowMs: 60_000,
      now: () => now,
    });

    await limiter.check({ userId: "u-1", packageId: "p-a" });
    await limiter.check({ userId: "u-1", packageId: "p-b" });
    const denied = await limiter.check({ userId: "u-1", packageId: "p-c" });
    expect(denied.allowed).toBe(false);
    if (denied.allowed) return;
    expect(denied.scope).toBe("per_user");
  });

  it("re-allows once the sliding window expires", async () => {
    let now = 1_000_000;
    const limiter = new InMemoryMentorRateLimiter({
      perUserLimit: 1,
      perUserPackageLimit: 1,
      windowMs: 1000,
      now: () => now,
    });
    expect(
      (await limiter.check({ userId: "u-1", packageId: "p" })).allowed,
    ).toBe(true);
    expect(
      (await limiter.check({ userId: "u-1", packageId: "p" })).allowed,
    ).toBe(false);

    now += 1500;
    expect(
      (await limiter.check({ userId: "u-1", packageId: "p" })).allowed,
    ).toBe(true);
  });

  it("isolates limits across users and across packages", async () => {
    const limiter = new InMemoryMentorRateLimiter({
      perUserLimit: 10,
      perUserPackageLimit: 1,
      windowMs: 60_000,
      now: () => 1_000_000,
    });
    expect(
      (await limiter.check({ userId: "u-1", packageId: "p-a" })).allowed,
    ).toBe(true);
    expect(
      (await limiter.check({ userId: "u-1", packageId: "p-a" })).allowed,
    ).toBe(false);
    // Different package — same user is allowed again.
    expect(
      (await limiter.check({ userId: "u-1", packageId: "p-b" })).allowed,
    ).toBe(true);
    // Different user, same package — also independent.
    expect(
      (await limiter.check({ userId: "u-2", packageId: "p-a" })).allowed,
    ).toBe(true);
  });

  it("rejects invalid construction options", () => {
    expect(
      () => new InMemoryMentorRateLimiter({ perUserLimit: 0 }),
    ).toThrowError(/must be positive/);
    expect(
      () => new InMemoryMentorRateLimiter({ perUserPackageLimit: -1 }),
    ).toThrowError(/must be positive/);
    expect(
      () => new InMemoryMentorRateLimiter({ windowMs: 0 }),
    ).toThrowError(/windowMs must be positive/);
  });

  it("defaultMentorRateLimiter returns a process-wide singleton", () => {
    resetDefaultMentorRateLimiterForTests();
    const a = defaultMentorRateLimiter();
    const b = defaultMentorRateLimiter();
    expect(a).toBe(b);
    resetDefaultMentorRateLimiterForTests();
    const c = defaultMentorRateLimiter();
    expect(c).not.toBe(a);
  });
});
