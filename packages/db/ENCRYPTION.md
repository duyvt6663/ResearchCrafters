# Column-level encryption at rest

This package ships transparent application-level encryption for the
highest-PII columns in the Prisma schema. Encrypted bytes are written to
plain Postgres `String` / `Json` columns — there is no schema change, no
migration, and no Postgres-level key material. Encryption happens at the
Prisma boundary via the client extension wired in `src/client.ts`.

## What is encrypted today

Six columns, drawn from the `/// PII:` JSDoc inventory in
`prisma/schema.prisma`:

| Model           | Field           | Why                                                                                                |
| --------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| `Account`       | `access_token`  | OAuth access token. Replayable against the upstream provider until expiry.                         |
| `Account`       | `refresh_token` | OAuth refresh token. Long-lived; mints fresh access tokens until revoked.                          |
| `Account`       | `id_token`      | OIDC id_token. Carries identity claims about the user.                                             |
| `Session`       | `sessionToken`  | NextAuth session cookie value AND the CLI bearer token. Whoever holds it can act as the user.      |
| `MentorMessage` | `bodyText`      | Free-text mentor transcripts (user prose + the model's reply that quotes it).                      |
| `StageAttempt`  | `answer`        | Free-text learner answers (writing stages, decision rationale, reflection). `Json`-shaped column.  |

The list is the constant `ENCRYPTED_FIELDS` in
`src/encrypted-fields.ts`; that constant is the single source of truth.
Adding a new column to the policy is a one-line change there.

## Wire format

Encrypted column values are opaque strings shaped:

```
enc:v1:<base64url(JSON(EncryptedEnvelope))>
```

The `EncryptedEnvelope` JSON has four fields:

| Key   | Bytes          | Notes                                                       |
| ----- | -------------- | ----------------------------------------------------------- |
| `v`   | n/a (number 1) | Format version. Bump for new algorithms.                    |
| `iv`  | 12 (random)    | AES-GCM nonce. Fresh per call.                              |
| `tag` | 16             | GCM authentication tag. Detects tampering and wrong keys.   |
| `ct`  | variable       | AES-256-GCM ciphertext of the UTF-8 plaintext.              |

Algorithm: **AES-256-GCM** via `node:crypto.createCipheriv`. GCM is
authenticated — a tampered ciphertext or wrong key surfaces as a
`DecryptError` rather than silent garbage.

## Key management

The encryption key is read from `RC_ENCRYPTION_KEY` in the environment.

**Generate a new key locally:**

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

**Store the key** in your secrets manager (Doppler / Vault / AWS Secrets
Manager — see `backlog/08-infra-foundations.md` §Secrets and Config). Each
deployment environment (`dev` / `preview` / `staging` / `prod`) gets its
own key; rotating one environment never affects the others.

**Length policy.** `RC_ENCRYPTION_KEY` must decode to ≥ 32 raw bytes after
base64url unwrapping. Shorter keys are accepted but get PBKDF2-stretched
to 32 bytes with a fixed application salt — the stretch is a fail-loud
courtesy, not a substitute for a real 32-byte secret. Production must use
a real 32-byte secret.

**`RC_ENCRYPTION_DISABLED=true`** bypasses the extension entirely. Use it
only in local dev when you don't want to deal with the env var.
**Production must never set this.**

## Bridging plan (existing plaintext rows)

Today the column already holds plaintext for any row that was inserted
before this change shipped. The extension is built to coexist with that
state:

1. **Read path is tolerant.** If the column value does not start with
   `enc:v1:`, the extension passes it through unchanged. Legacy plaintext
   rows continue to deserialise as before; no app-level error, no row drop.
2. **Write path always encrypts.** Any new `create` / `update` / `upsert`
   for a configured field encrypts before the SQL flushes. Subsequent
   reads of that row return the decrypted plaintext.
3. **Idempotency.** `encrypt()` short-circuits when the input already
   starts with `enc:v1:`, so a read-mutate-write round-trip never
   double-encrypts.
4. **Backfill (out of scope here).** A future one-shot script will:
   1. Open a transaction.
   2. `findMany` rows where the column value is non-null and does NOT
      start with `enc:v1:`.
   3. Write each back unchanged — the extension's write transform
      encrypts in flight.
   4. Commit.

   The script lives outside this package (most likely
   `apps/worker/src/scripts/backfill-encryption.ts`) and is gated behind
   an explicit flag because it touches every row.

## Decrypt failures during reads

When the read path encounters an `enc:v1:` value it cannot decrypt
(corrupted ciphertext, wrong key after a botched rotation), the
extension does **not** throw. It logs a structured warning to stderr:

```json
{ "kind": "encryption_decrypt_failed", "model": "Account", "field": "access_token", "id": "..." }
```

…and returns `null` for that field on that row. Throwing here would take
down `findMany` results for the entire query; nulling preserves
availability. Operators are expected to alert on the warning kind and
investigate.

## Key rotation

Two flavours, both forward-compatible thanks to the `v` envelope tag:

- **In-place re-key (same algorithm).** Out of scope for `enc:v1`;
  requires a backfill script that reads each row with the old key and
  rewrites it with the new key, holding both keys for the duration.
- **Algorithm rotation.** Bump the wire format to `enc:v2:` (e.g.
  KMS-wrapped DEKs, or a different cipher). The decrypt dispatch in
  `src/crypto.ts` reads the version prefix first and routes to the
  matching implementation; running both versions side-by-side during the
  transition is a documentation-only effort.

## Local dev workflow

If you don't want encryption locally:

```env
RC_ENCRYPTION_DISABLED=true
```

If you do (recommended for parity with deployed environments):

```env
RC_ENCRYPTION_KEY=<output of the node randomBytes one-liner above>
```

Set one of the two before running `pnpm dev`. The Prisma client will
throw `MissingKeyError` on the first read/write of a configured field if
neither is set.

## What is NOT encrypted

The `/// PII:` inventory tags many more columns than the six above. Most
of them stay plaintext for product reasons (queryability, search, joins,
cohort math). The six on this list are the ones whose plaintext is most
dangerous to lose — auth secrets that grant immediate account access, and
user-authored prose that is the most personal content the platform
holds. Expanding the policy is a one-line change to `ENCRYPTED_FIELDS`;
note that any column you add here loses queryability under WHERE clauses
(the ciphertext is opaque to Postgres).
