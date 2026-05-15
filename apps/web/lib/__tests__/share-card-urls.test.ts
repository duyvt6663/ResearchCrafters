import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildShareCardImageUrl,
  buildShareCardPublicUrl,
} from "../share-card-urls";

/**
 * Pins the public-URL contract that `/api/share-cards` returns to clients
 * and that `/s/[slug]/page.tsx` advertises to social-card crawlers via
 * OpenGraph. The same env-var → URL mapping is reused by both surfaces, so
 * a regression here would silently break both publish + social previews.
 */

const PUBLIC = "PUBLIC_APP_URL";
const NEXT_PUBLIC = "NEXT_PUBLIC_APP_URL";

let savedPublic: string | undefined;
let savedNextPublic: string | undefined;

beforeEach(() => {
  savedPublic = process.env[PUBLIC];
  savedNextPublic = process.env[NEXT_PUBLIC];
  delete process.env[PUBLIC];
  delete process.env[NEXT_PUBLIC];
});

afterEach(() => {
  if (savedPublic === undefined) delete process.env[PUBLIC];
  else process.env[PUBLIC] = savedPublic;
  if (savedNextPublic === undefined) delete process.env[NEXT_PUBLIC];
  else process.env[NEXT_PUBLIC] = savedNextPublic;
});

describe("buildShareCardPublicUrl", () => {
  it("falls back to localhost when no env var is set", () => {
    expect(buildShareCardPublicUrl("abc")).toBe("http://localhost:3000/s/abc");
  });

  it("prefers PUBLIC_APP_URL over the localhost default", () => {
    process.env[PUBLIC] = "https://app.example.com";
    expect(buildShareCardPublicUrl("abc")).toBe(
      "https://app.example.com/s/abc",
    );
  });

  it("falls back to NEXT_PUBLIC_APP_URL when PUBLIC_APP_URL is unset", () => {
    process.env[NEXT_PUBLIC] = "https://staging.example.com";
    expect(buildShareCardPublicUrl("abc")).toBe(
      "https://staging.example.com/s/abc",
    );
  });

  it("strips a trailing slash from the configured base", () => {
    process.env[PUBLIC] = "https://app.example.com/";
    expect(buildShareCardPublicUrl("abc")).toBe(
      "https://app.example.com/s/abc",
    );
  });
});

describe("buildShareCardImageUrl", () => {
  it("returns an absolute URL with the slug as the s= query", () => {
    process.env[PUBLIC] = "https://app.example.com";
    expect(buildShareCardImageUrl("sc-1", "slug-1")).toBe(
      "https://app.example.com/api/share-cards/sc-1/image.svg?s=slug-1",
    );
  });

  it("URL-encodes the id and slug so weird characters can't break the URL", () => {
    process.env[PUBLIC] = "https://app.example.com";
    const url = buildShareCardImageUrl("sc/1 2", "a b/c");
    expect(url).toContain("sc%2F1%202");
    expect(url).toContain("s=a%20b%2Fc");
  });
});
