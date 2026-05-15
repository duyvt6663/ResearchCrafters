// Unit tests for the alpha-access gate. Mirrors the behaviour wired into
// the NextAuth `signIn` callback in `apps/web/auth.config.ts`.

import { describe, expect, it } from "vitest";
import {
  decideAlphaAccess,
  parseAllowlist,
} from "../alpha-allowlist.js";

describe("parseAllowlist", () => {
  it("returns an empty list for unset / empty input", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist(null)).toEqual([]);
    expect(parseAllowlist("")).toEqual([]);
    expect(parseAllowlist("   \n  ")).toEqual([]);
  });

  it("splits on commas, whitespace, and newlines, lowercases, and trims", () => {
    expect(
      parseAllowlist(" Alice@Example.com , bob@example.com\nCAROL@example.com"),
    ).toEqual([
      "alice@example.com",
      "bob@example.com",
      "carol@example.com",
    ]);
  });

  it("drops entries that do not contain an @", () => {
    expect(parseAllowlist("# alpha cohort, ok@example.com, TODO")).toEqual([
      "ok@example.com",
    ]);
  });
});

describe("decideAlphaAccess", () => {
  it("allows everyone when the allowlist is empty (gate OFF)", () => {
    expect(decideAlphaAccess("anyone@example.com", "")).toEqual({
      allowed: true,
      reason: "allowlist_disabled",
    });
    expect(decideAlphaAccess(null, undefined)).toEqual({
      allowed: true,
      reason: "allowlist_disabled",
    });
  });

  it("denies when the allowlist is set but the email is missing", () => {
    expect(decideAlphaAccess(null, "ok@example.com")).toEqual({
      allowed: false,
      reason: "missing_email",
    });
    expect(decideAlphaAccess("   ", "ok@example.com")).toEqual({
      allowed: false,
      reason: "missing_email",
    });
  });

  it("allows when the email matches an allowlist entry (case-insensitive)", () => {
    expect(
      decideAlphaAccess("Alice@Example.com", "alice@example.com,bob@example.com"),
    ).toEqual({ allowed: true, reason: "email_on_allowlist" });
  });

  it("denies when the email is not on the allowlist", () => {
    expect(
      decideAlphaAccess("stranger@example.com", "alice@example.com"),
    ).toEqual({ allowed: false, reason: "not_on_allowlist" });
  });
});
