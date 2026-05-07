// Authenticated column-level encryption for Postgres-stored PII.
//
// This module is a leaf — no Prisma, no DB I/O, no globals beyond a lazy
// derived-key cache. It exists to encrypt and decrypt small string payloads
// (tokens, transcripts, JSON-stringified answers) in the application before
// Prisma writes them, and after Prisma reads them.
//
// Algorithm
// ---------
// AES-256-GCM via `node:crypto.createCipheriv`. GCM is authenticated — the
// 16-byte tag detects ciphertext tampering and wrong-key decryption attempts;
// both surface as a `DecryptError` rather than silent garbage.
//
// Wire format
// -----------
// `enc:v1:<base64url(JSON(EncryptedEnvelope))>`
//
// The `enc:v1:` prefix is the version tag — future algorithms can bump to
// `enc:v2:` and the read path can dispatch on the prefix without changing
// the column type. The opaque token is what we store in Postgres.
//
// Key handling
// ------------
// `RC_ENCRYPTION_KEY` is a base64url-encoded secret of >= 32 bytes (raw).
// If the decoded raw bytes are shorter than 32, we PBKDF2-derive a 32-byte
// key from the provided material with a fixed application salt. The point is
// fail-loud if someone configured a weak key — if `RC_ENCRYPTION_KEY` is
// unset, the first `encrypt`/`decrypt` call throws `MissingKeyError`.
//
// Idempotency contract
// --------------------
// `encrypt(token)` where `token` is already an `enc:v1:...` envelope MUST
// return the same token unchanged (the extension uses this to short-circuit
// double-encryption when a write happens to be a re-write of a read row).

import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";

// ---------------------------------------------------------------------------
// Public types and errors
// ---------------------------------------------------------------------------

/**
 * Versioned envelope written into the opaque token. JSON-serialized then
 * base64url-encoded so the on-disk value is a single ASCII string.
 *
 * `v` is the format version. Bumping it lets us add new algorithms later
 * (e.g. AES-256-SIV, KMS-wrapped DEKs) without breaking the read path —
 * the decrypt dispatch reads `v` first and falls through to the matching
 * implementation.
 */
export interface EncryptedEnvelope {
  /** Format version. Currently always 1. */
  v: 1;
  /** base64url-encoded 12-byte IV. Fresh per call. */
  iv: string;
  /** base64url-encoded 16-byte GCM auth tag. */
  tag: string;
  /** base64url-encoded ciphertext. */
  ct: string;
}

/** Thrown when the ciphertext is corrupted, tampered, or the key is wrong. */
export class DecryptError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DecryptError";
  }
}

/** Thrown when `RC_ENCRYPTION_KEY` is unset or unusable. */
export class MissingKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingKeyError";
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENVELOPE_PREFIX = "enc:v1:";
const ENVELOPE_VERSION = 1 as const;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32; // AES-256
/**
 * Fixed application salt for PBKDF2 key-stretching. Salt is constant across
 * the deployment because the keying material itself is the secret; this
 * derivation only hardens against very-short or low-entropy `RC_ENCRYPTION_KEY`
 * values. Rotating this string would invalidate every encrypted row, so it
 * never changes (a future `enc:v2:` would be the rotation vehicle).
 */
const PBKDF2_SALT = Buffer.from("researchcrafters/db/crypto/v1");
const PBKDF2_ITER = 200_000;
const KEY_ENV = "RC_ENCRYPTION_KEY";

// ---------------------------------------------------------------------------
// Lazy key cache
// ---------------------------------------------------------------------------

let cachedKey: Buffer | null = null;
let cachedKeyMaterial: string | null = null;

/**
 * Resolve the 32-byte AES key from `RC_ENCRYPTION_KEY`. The result is cached
 * on first use so we don't re-derive PBKDF2 on every call. We also cache the
 * raw env string so a test can mutate `process.env.RC_ENCRYPTION_KEY` and the
 * next call picks the new value up automatically.
 */
function resolveKey(override?: Buffer): Buffer {
  if (override) return ensureKeyLength(override);

  const material = process.env[KEY_ENV];
  if (!material || material.length === 0) {
    throw new MissingKeyError(
      `${KEY_ENV} is unset; cannot encrypt or decrypt PII columns. Set it ` +
        `to a 32+ byte base64url secret, or set RC_ENCRYPTION_DISABLED=true ` +
        `for local-dev workflows.`,
    );
  }

  if (cachedKey && cachedKeyMaterial === material) {
    return cachedKey;
  }

  const decoded = decodeKeyMaterial(material);
  const stretched =
    decoded.byteLength >= KEY_LEN
      ? decoded.subarray(0, KEY_LEN)
      : pbkdf2Sync(decoded, PBKDF2_SALT, PBKDF2_ITER, KEY_LEN, "sha256");

  cachedKey = stretched;
  cachedKeyMaterial = material;
  return stretched;
}

/**
 * Decode the `RC_ENCRYPTION_KEY` env var. We accept either base64url, base64,
 * or raw UTF-8: operators copy/paste from a few different generators (the
 * `crypto.randomBytes(32).toString('base64url')` we recommend, OpenSSL's
 * `-base64`, or a passphrase). Whichever format we see, the bytes go through
 * the length check — short keys get PBKDF2-stretched.
 */
function decodeKeyMaterial(material: string): Buffer {
  // Try base64url first (no padding, no `+` or `/`).
  if (/^[A-Za-z0-9_-]+$/.test(material)) {
    try {
      const buf = Buffer.from(material, "base64url");
      if (buf.byteLength > 0) return buf;
    } catch {
      // fall through
    }
  }
  // Try base64 (with padding).
  if (/^[A-Za-z0-9+/=]+$/.test(material)) {
    try {
      const buf = Buffer.from(material, "base64");
      if (buf.byteLength > 0) return buf;
    } catch {
      // fall through
    }
  }
  // Last resort: raw UTF-8 bytes. PBKDF2 below will stretch this to 32 bytes.
  return Buffer.from(material, "utf8");
}

function ensureKeyLength(key: Buffer): Buffer {
  if (key.byteLength === KEY_LEN) return key;
  if (key.byteLength > KEY_LEN) return key.subarray(0, KEY_LEN);
  // Caller passed an explicit short key — derive deterministically so test
  // helpers can still drive the same key path.
  return pbkdf2Sync(key, PBKDF2_SALT, PBKDF2_ITER, KEY_LEN, "sha256");
}

/**
 * Test seam: drop the cached key. Production code never calls this; tests
 * call it after mutating `process.env.RC_ENCRYPTION_KEY` directly. Exported
 * via the index so `crypto.test.ts` can reach it.
 */
export function _resetKeyCacheForTests(): void {
  cachedKey = null;
  cachedKeyMaterial = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a UTF-8 string and return the opaque `enc:v1:...` token. If the
 * input already looks like an envelope (`enc:v1:` prefix), it is returned
 * unchanged — the extension uses this to short-circuit double-encryption.
 *
 * @param plaintext value to encrypt; pass `""` for an empty cell.
 * @param key optional 32-byte key for tests; defaults to the singleton
 *   derived from `RC_ENCRYPTION_KEY`.
 */
export function encrypt(plaintext: string, key?: Buffer): string {
  if (isEncrypted(plaintext)) {
    // Idempotency: re-encrypting an already-encrypted token is a no-op.
    // The Prisma extension's write path leans on this when a row's encrypted
    // column comes back from `findUnique` -> mutate -> `update` round-trip.
    return plaintext;
  }

  const k = resolveKey(key);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const envelope: EncryptedEnvelope = {
    v: ENVELOPE_VERSION,
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    ct: ct.toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(envelope), "utf8").toString(
    "base64url",
  );
  return `${ENVELOPE_PREFIX}${encoded}`;
}

/**
 * Decrypt an `enc:v1:...` token and return the original UTF-8 string.
 * Throws {@link DecryptError} on tag mismatch, malformed envelope, or wrong
 * key. NEVER returns silent garbage — GCM's authenticated tag is what makes
 * this safe.
 *
 * @param token the opaque envelope string produced by {@link encrypt}.
 * @param key optional 32-byte key for tests.
 */
export function decrypt(token: string, key?: Buffer): string {
  if (typeof token !== "string" || !token.startsWith(ENVELOPE_PREFIX)) {
    throw new DecryptError(
      `value is not an enc:v1 envelope (got ${describeShape(token)})`,
    );
  }

  const body = token.slice(ENVELOPE_PREFIX.length);
  let envelope: EncryptedEnvelope;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    envelope = assertEnvelope(parsed);
  } catch (err) {
    throw new DecryptError("malformed envelope payload", { cause: err });
  }

  const k = resolveKey(key);
  const iv = Buffer.from(envelope.iv, "base64url");
  const tag = Buffer.from(envelope.tag, "base64url");
  const ct = Buffer.from(envelope.ct, "base64url");

  if (iv.byteLength !== IV_LEN) {
    throw new DecryptError(`invalid iv length ${iv.byteLength}`);
  }
  if (tag.byteLength !== TAG_LEN) {
    throw new DecryptError(`invalid tag length ${tag.byteLength}`);
  }

  const decipher = createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAuthTag(tag);
  try {
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch (err) {
    // GCM throws on tag-mismatch — i.e. the ciphertext was tampered with or
    // the key is wrong. Re-wrap so callers see a stable error type.
    throw new DecryptError("authentication tag mismatch", { cause: err });
  }
}

/**
 * True iff `value` is a string starting with the `enc:v1:` envelope prefix.
 * Cheap structural check — does NOT validate the envelope payload. Use this
 * for idempotency short-circuits in the write path; use {@link decrypt} when
 * you actually need the plaintext (and accept the throw on bad input).
 */
export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(ENVELOPE_PREFIX);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertEnvelope(parsed: unknown): EncryptedEnvelope {
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("envelope is not an object");
  }
  const env = parsed as Record<string, unknown>;
  if (env["v"] !== ENVELOPE_VERSION) {
    throw new Error(`unsupported envelope version ${String(env["v"])}`);
  }
  if (
    typeof env["iv"] !== "string" ||
    typeof env["tag"] !== "string" ||
    typeof env["ct"] !== "string"
  ) {
    throw new Error("envelope is missing required string fields");
  }
  return {
    v: ENVELOPE_VERSION,
    iv: env["iv"],
    tag: env["tag"],
    ct: env["ct"],
  };
}

function describeShape(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value !== "string") return typeof value;
  if (value.length === 0) return "empty-string";
  return `string(len=${value.length})`;
}
