// Unit tests for the column-level encryption helper.
//
// The Prisma extension itself (encrypted-fields.ts) is exercised at the
// integration level — we cannot meaningfully test the extension's read/write
// transforms without a live Prisma client and a live Postgres. Those tests
// are deferred via `it.skip` below; everything that matters at the unit
// level lives in this file. The crypto envelope is the wire-format contract:
// if these tests stay green, the extension's behaviour reduces to "look up
// the right column and call encrypt/decrypt".

import { beforeEach, describe, expect, it } from "vitest";
import {
  DecryptError,
  decrypt,
  encrypt,
  isEncrypted,
  MissingKeyError,
} from "../src/crypto.js";
import { _resetKeyCacheForTests } from "../src/crypto.js";

const TEST_KEY_BASE64URL =
  // 32 bytes of deterministic test material, base64url-encoded.
  // openssl rand -hex 32 -> 0x00..0x1f, but we hand-spell it so the
  // value never depends on the test host's randomness.
  "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

beforeEach(() => {
  process.env["RC_ENCRYPTION_KEY"] = TEST_KEY_BASE64URL;
  delete process.env["RC_ENCRYPTION_DISABLED"];
  _resetKeyCacheForTests();
});

describe("crypto: round-trip", () => {
  it("encrypt -> decrypt returns the original plaintext", () => {
    const token = encrypt("hello");
    expect(token.startsWith("enc:v1:")).toBe(true);
    expect(decrypt(token)).toBe("hello");
  });

  it("handles an empty string cleanly", () => {
    // Edge case: the cipher.update("") path should still produce a valid
    // envelope (tag from final()) and decrypt() should return "".
    const token = encrypt("");
    expect(isEncrypted(token)).toBe(true);
    expect(decrypt(token)).toBe("");
  });

  it("each call uses a fresh IV (no determinism)", () => {
    // Two encryptions of the same plaintext MUST yield different envelopes —
    // otherwise an attacker watching the column can correlate identical
    // values across rows.
    const a = encrypt("same-input");
    const b = encrypt("same-input");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same-input");
    expect(decrypt(b)).toBe("same-input");
  });
});

describe("crypto: integrity guarantees", () => {
  it("flipping a byte in the ciphertext throws DecryptError", () => {
    const token = encrypt("sensitive-data");
    // Decode the envelope, mutate the ct field, re-encode, and try decrypting.
    const body = token.slice("enc:v1:".length);
    const json = Buffer.from(body, "base64url").toString("utf8");
    const envelope = JSON.parse(json) as {
      v: number;
      iv: string;
      tag: string;
      ct: string;
    };
    const ctBuf = Buffer.from(envelope.ct, "base64url");
    // XOR the first byte of ciphertext.
    ctBuf[0] = (ctBuf[0] ?? 0) ^ 0x01;
    envelope.ct = ctBuf.toString("base64url");
    const tampered =
      "enc:v1:" +
      Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");

    expect(() => decrypt(tampered)).toThrow(DecryptError);
  });

  it("decrypting with the wrong key throws DecryptError, not silent garbage", () => {
    const correctKey = Buffer.alloc(32, 0x11);
    const wrongKey = Buffer.alloc(32, 0x22);
    const token = encrypt("auth-secret", correctKey);
    expect(decrypt(token, correctKey)).toBe("auth-secret");
    expect(() => decrypt(token, wrongKey)).toThrow(DecryptError);
  });
});

describe("crypto: shape predicates", () => {
  it("isEncrypted recognises the v1 envelope prefix", () => {
    expect(isEncrypted("enc:v1:abc")).toBe(true);
  });

  it("isEncrypted returns false for plain strings", () => {
    expect(isEncrypted("plain")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
    expect(isEncrypted(42)).toBe(false);
    expect(isEncrypted({ token: "enc:v1:abc" })).toBe(false);
  });
});

describe("crypto: key handling", () => {
  it("missing RC_ENCRYPTION_KEY throws MissingKeyError on first use", () => {
    delete process.env["RC_ENCRYPTION_KEY"];
    _resetKeyCacheForTests();
    expect(() => encrypt("anything")).toThrow(MissingKeyError);
  });

  it("encrypt is idempotent on already-encrypted tokens", () => {
    // The Prisma extension uses this short-circuit: writing back a row that
    // was just read MUST NOT double-encrypt the column.
    const once = encrypt("payload");
    const twice = encrypt(once);
    expect(twice).toBe(once);
    expect(decrypt(twice)).toBe("payload");
  });

  it("explicit short key is PBKDF2-stretched deterministically", () => {
    // The helper accepts a Buffer override for tests/scripts. A short Buffer
    // gets stretched, so the same short input must produce the same key
    // every call — otherwise round-trip with explicit keys breaks.
    const shortKey = Buffer.from("short-passphrase");
    const token = encrypt("payload", shortKey);
    expect(decrypt(token, shortKey)).toBe("payload");
  });
});

describe("crypto: malformed input", () => {
  it("non-envelope strings throw DecryptError", () => {
    expect(() => decrypt("plaintext")).toThrow(DecryptError);
    expect(() => decrypt("")).toThrow(DecryptError);
    expect(() => decrypt("enc:v2:something")).toThrow(DecryptError);
  });

  it("garbled envelope payload throws DecryptError", () => {
    expect(() => decrypt("enc:v1:not-base64url!!!")).toThrow(DecryptError);
  });
});

describe("Prisma extension integration", () => {
  // The extension transforms args going through the Prisma engine. To test it
  // we'd need a live Postgres + generated client + actual rows. That belongs
  // in an integration suite that boots the docker-compose Postgres; for now
  // we deliberately skip and rely on the per-field walker via the crypto
  // unit tests above. See ENCRYPTION.md §Bridging Plan for the larger
  // backfill rehearsal that will exercise the read path.
  it.skip("TODO: integration coverage for withEncryption() against a live Postgres", () => {});
});
