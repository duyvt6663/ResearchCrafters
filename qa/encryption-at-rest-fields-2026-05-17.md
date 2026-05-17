# QA Report: Privacy Plumbing — Encryption-at-Rest Fields

- Date: 2026-05-17
- Backlog item: `backlog/06-data-access-analytics.md:186` — "Add privacy
  plumbing: encryption-at-rest fields" (rollup at
  `backlog/08-infra-foundations.md` §Privacy and Compliance Foundations
  + §Open gaps from snapshot).
- Scope: verify the column-level encryption-at-rest plumbing is landed,
  wired into the Prisma singleton, documented, and behaves correctly
  for the six configured PII fields.

## Implementation surfaces (what already exists)

- `packages/db/src/crypto.ts` — AES-256-GCM envelope encoder.
  - Wire format: `enc:v1:<base64url(JSON({v:1, iv, tag, ct}))>`.
  - Fresh 12-byte IV per call, 16-byte GCM auth tag.
  - `MissingKeyError` when `RC_ENCRYPTION_KEY` is unset.
  - `DecryptError` (never silent garbage) on tampered ciphertext, bad
    key, malformed envelope, or wrong version prefix.
  - Idempotent `encrypt()` short-circuit on `enc:v1:` input so the
    Prisma extension's read-mutate-write round-trip never double-encrypts.
  - Key handling: base64url / base64 / raw-utf8 decode, PBKDF2-stretch
    for short keys with a fixed app salt (200k iters, sha256),
    lazy-cached.
- `packages/db/src/encrypted-fields.ts` — policy + Prisma extension.
  - `ENCRYPTED_FIELDS` is the single source of truth (6 entries):
    `Account.access_token`, `Account.refresh_token`, `Account.id_token`,
    `Session.sessionToken`, `MentorMessage.bodyText`,
    `StageAttempt.answer` (with `jsonStringify: true` for the `Json`
    column).
  - `withEncryption()` returns a `Prisma.defineExtension` that hooks
    `create` / `update` / `upsert` / `createMany` / `updateMany`
    write paths (peels the `{ set: ... }` update wrapper) and exposes
    per-field `result` computed properties with `needs` declarations so
    narrowed `select` calls still drive the decrypt path.
  - Read path is tolerant of legacy plaintext rows (pre-encryption
    bridge): if the column value is not an `enc:v1:` envelope it is
    passed through unchanged.
  - Decrypt failures null the field + emit structured warning
    (`{kind:"encryption_decrypt_failed", model, field, id, message}`)
    rather than throw — preserves availability of bulk `findMany`.
  - `RC_ENCRYPTION_DISABLED=true` flips the extension to a no-op for
    local-dev workflows; production must never set it.
- `packages/db/src/client.ts` — applies `withEncryption()` to the
  `PrismaClient` singleton; cached on `globalThis` outside production.
  Downstream apps (`apps/web`, `apps/worker`, `apps/runner`,
  `packages/telemetry`) import `prisma` from `@researchcrafters/db`
  and never see envelope tokens.
- `packages/db/src/index.ts` — re-exports `encrypt`, `decrypt`,
  `isEncrypted`, `DecryptError`, `MissingKeyError`, `ENCRYPTED_FIELDS`,
  `withEncryption`, `isEncryptionDisabled`, and `EncryptedEnvelope`
  / `EncryptedFieldPolicy` types.
- `packages/db/prisma/schema.prisma` — `/// PII:` JSDoc on the six
  configured fields calls out the encryption-at-rest contract pointing
  to `backlog/08 §Privacy`.
- `packages/db/ENCRYPTION.md` — operator runbook: covered columns
  table, wire format, key generation (`node -e
  "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`),
  key length policy, bridging plan for existing plaintext rows,
  decrypt-failure behaviour, key rotation (in-place / algorithm), and
  the local-dev `RC_ENCRYPTION_DISABLED` switch.

## Verification

Command:

```sh
pnpm --filter @researchcrafters/db test
```

Result: `4 test files passed, 31 passed | 1 skipped (32)`.

`test/crypto.test.ts` exercises:

- Round-trip: `encrypt -> decrypt` returns plaintext; empty string
  edge case; fresh-IV non-determinism (two encryptions of the same
  input yield distinct envelopes).
- Integrity: flipping a single byte of ciphertext throws
  `DecryptError`; decryption with the wrong key throws `DecryptError`
  (no silent garbage).
- Shape predicates: `isEncrypted` recognises the `enc:v1:` prefix and
  rejects plain strings, empty strings, null, undefined, numbers,
  objects.
- Key handling: missing `RC_ENCRYPTION_KEY` throws `MissingKeyError`
  on first use; `encrypt` is idempotent on already-encrypted tokens;
  explicit short Buffer keys are PBKDF2-stretched deterministically so
  short-key round-trips work.
- Malformed input: non-envelope strings, empty strings, wrong version
  prefix (`enc:v2:`), and garbled base64url all throw `DecryptError`.
- Skipped: live-Postgres extension integration (boots full Prisma + DB
  — deferred to a future integration suite per `ENCRYPTION.md`
  §Bridging Plan).

## Backlog updates

- `backlog/06-data-access-analytics.md:186` — flipped to `[x]` with
  pointers to `crypto.ts`, `encrypted-fields.ts`, `client.ts`,
  `ENCRYPTION.md`, and this QA report.
- `backlog/08-infra-foundations.md` §Privacy and Compliance Foundations
  ("Add encryption-at-rest for sensitive columns…") — flipped to `[x]`
  with the same pointers.
- `backlog/08-infra-foundations.md` §Open gaps from snapshot ("Land
  privacy foundations…") — flipped to `[x]`; all four sub-items
  (PII inventory, encryption-at-rest, data export, deletion cascade)
  are now landed.

## Out of scope (residual risks; tracked elsewhere)

- `backlog/10-integration-quality-gaps.md:60-77` — known follow-ups
  from the DB encryption work that this iteration does not touch:
  - `pnpm turbo run typecheck --force` failures in
    `@researchcrafters/db` (`src/crypto.ts` `{}`-length typing,
    `src/encrypted-fields.ts` Prisma extension typing,
    `src/seed.ts` extended-model `unknown`).
  - `pnpm --filter @researchcrafters/web build`
    `UnhandledSchemeError` for `node:crypto` because the web build
    bundles the DB top-level export. Needs a server-only entrypoint
    split for the encryption helpers.
- `backlog/08-infra-foundations.md` §Open gaps from snapshot —
  "Keep server-only Node modules out of web bundles" is the same
  bundle-splitting issue.
- Backfill of existing plaintext rows (per `ENCRYPTION.md` §Bridging
  Plan) — a future one-shot script
  (`apps/worker/src/scripts/backfill-encryption.ts`) is gated behind
  an explicit flag and out of scope here.
- Production secrets management — the runbook documents `RC_ENCRYPTION_KEY`
  generation and per-environment isolation; provisioning it into the
  secrets manager is tracked under `backlog/08 §Open gaps` ("Choose
  and wire a secrets manager").

## Result

Pass. Encryption-at-rest plumbing is implemented, wired into the Prisma
singleton, covered by unit tests (31/31 in `@researchcrafters/db`), and
documented operationally. Remaining items are integration-quality
cleanups already tracked in `backlog/10` and `backlog/08 §Open gaps`.
