import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isReviewer } from "../reviewer-access";

const ENV_KEY = "REVIEWER_USER_IDS";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalEnv;
  }
});

describe("isReviewer", () => {
  it("default-denies when REVIEWER_USER_IDS is unset", () => {
    expect(isReviewer("u-1")).toBe(false);
  });

  it("default-denies for null / empty user ids", () => {
    process.env[ENV_KEY] = "u-1,u-2";
    expect(isReviewer(null)).toBe(false);
    expect(isReviewer(undefined)).toBe(false);
    expect(isReviewer("")).toBe(false);
  });

  it("allows ids present in the comma-separated allowlist", () => {
    process.env[ENV_KEY] = "u-1, u-2 ,u-3";
    expect(isReviewer("u-1")).toBe(true);
    expect(isReviewer("u-2")).toBe(true);
    expect(isReviewer("u-3")).toBe(true);
  });

  it("rejects ids that are not in the allowlist", () => {
    process.env[ENV_KEY] = "u-1,u-2";
    expect(isReviewer("u-3")).toBe(false);
    expect(isReviewer("U-1")).toBe(false); // case-sensitive
  });

  it("treats an empty allowlist string as default-deny", () => {
    process.env[ENV_KEY] = "";
    expect(isReviewer("u-1")).toBe(false);
  });

  it("ignores empty entries between commas", () => {
    process.env[ENV_KEY] = ",,u-1,,";
    expect(isReviewer("u-1")).toBe(true);
    expect(isReviewer("")).toBe(false);
  });
});
