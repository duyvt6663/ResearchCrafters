// Field policy + Prisma client extension for column-level encryption.
//
// `ENCRYPTED_FIELDS` is the single source of truth for which model+field
// pairs get transparent at-rest encryption. The {@link withEncryption}
// extension wires the policy into the Prisma client so every consumer that
// imports `@researchcrafters/db`'s `prisma` singleton sees plaintext on read
// and supplies plaintext on write — encryption happens at the boundary.
//
// Why an extension and not middleware
// -----------------------------------
// Prisma 5 deprecated `$use` middleware in favour of `$extends`. The extension
// API also lets us scope read-side transforms via `result` (per-row field
// computation), which is exactly the right surface for "decrypt this column
// when it's a string starting with enc:v1:".
//
// Typing pragmatics
// -----------------
// The `query` and `result` shapes are deeply per-model in `@prisma/client`'s
// generated types; modelling a generic field-walker against them without
// specialising to every model would require a level of conditional typing
// that buys us nothing at runtime. We dispatch dynamically using the model
// name from the policy and reach for `any`/`unknown` where the dynamic
// shape forces it. The runtime contract is: write-side rewrites
// `args.data[field]`, read-side rewrites the row's `field` member.

import { Prisma } from "@prisma/client";
import {
  decrypt,
  encrypt,
  isEncrypted,
} from "./crypto.js";

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * One entry in the encryption policy. Models are referenced by their Prisma
 * accessor name (lower-cased model name); fields by the schema column name.
 *
 * `jsonStringify` flips the encoding strategy for fields typed as Prisma
 * `Json`: the plaintext shape is whatever the application reads/writes, but
 * the bytes that get encrypted are `JSON.stringify(plaintext)` and the bytes
 * read back get `JSON.parse(...)` before being handed to the consumer.
 */
export interface EncryptedFieldPolicy {
  /** Capitalised model name (matches `Prisma.ModelName.Account`). */
  model: string;
  /** Field name as declared in `schema.prisma`. */
  field: string;
  /**
   * If true, treat the plaintext value as JSON and round-trip via
   * `JSON.stringify` / `JSON.parse`. Required for `Json` columns whose
   * application-level shape is structured.
   */
  jsonStringify?: boolean;
}

/**
 * The six highest-PII columns called out in `schema.prisma`'s `/// PII:`
 * inventory. Order is documentation-only; the extension treats the array
 * as a set keyed by `(model, field)`.
 *
 *  - Account.{access_token, refresh_token, id_token} — OAuth secrets, can
 *    be replayed against the upstream provider until expiry.
 *  - Session.sessionToken — doubles as the CLI bearer token; whoever holds
 *    this string can act as the user until session expiry.
 *  - MentorMessage.bodyText — free-text mentor transcripts (both user prose
 *    and the model's response referencing it).
 *  - StageAttempt.answer — free-text learner answers; `Json` so we
 *    JSON-stringify before encrypting.
 */
export const ENCRYPTED_FIELDS: ReadonlyArray<EncryptedFieldPolicy> = [
  { model: "Account", field: "access_token" },
  { model: "Account", field: "refresh_token" },
  { model: "Account", field: "id_token" },
  { model: "Session", field: "sessionToken" },
  { model: "MentorMessage", field: "bodyText" },
  { model: "StageAttempt", field: "answer", jsonStringify: true },
] as const;

// Pre-bucket the policy by model for O(1) lookup at the per-call hot path.
const POLICY_BY_MODEL: Map<string, EncryptedFieldPolicy[]> = (() => {
  const m = new Map<string, EncryptedFieldPolicy[]>();
  for (const entry of ENCRYPTED_FIELDS) {
    const list = m.get(entry.model) ?? [];
    list.push(entry);
    m.set(entry.model, list);
  }
  return m;
})();

// Lower-cased model accessor (e.g. "Account" -> "account") for the result
// extension keys, which Prisma exposes by the camelCase accessor name.
function modelAccessor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

/**
 * Honour `RC_ENCRYPTION_DISABLED=true` for local-dev workflows where the
 * operator hasn't bothered to set `RC_ENCRYPTION_KEY`. Production must NEVER
 * set this — the extension becomes a no-op.
 */
export function isEncryptionDisabled(): boolean {
  const flag = process.env["RC_ENCRYPTION_DISABLED"];
  return flag === "true" || flag === "1";
}

// ---------------------------------------------------------------------------
// Field walkers
// ---------------------------------------------------------------------------

/**
 * Encrypt the configured fields on a write payload in place. Tolerates the
 * field being absent (no-op) and `null` (left as-is — Prisma takes that as
 * "set NULL" / "no value provided"). Already-encrypted strings short-circuit.
 *
 * Walks both the top-level `data` object and any `data` nested inside `where`
 * for upserts (`upsert.create` / `upsert.update`). The caller is responsible
 * for choosing which sub-objects to pass.
 */
function encryptWriteFields(
  data: Record<string, unknown> | undefined,
  fields: EncryptedFieldPolicy[],
): void {
  if (!data || typeof data !== "object") return;

  for (const policy of fields) {
    if (!(policy.field in data)) continue;
    const raw = data[policy.field];
    if (raw === null || raw === undefined) continue;

    // Prisma supports operation wrappers on update payloads, e.g.
    //   { fieldName: { set: "new value" } }
    // We need to peel that wrapper, encrypt the inner value, and put it back.
    if (
      typeof raw === "object" &&
      raw !== null &&
      !Array.isArray(raw) &&
      "set" in (raw as Record<string, unknown>)
    ) {
      const wrapper = raw as { set?: unknown };
      if (wrapper.set !== undefined && wrapper.set !== null) {
        wrapper.set = transformPlaintextToCipher(wrapper.set, policy);
      }
      continue;
    }

    data[policy.field] = transformPlaintextToCipher(raw, policy);
  }
}

function transformPlaintextToCipher(
  value: unknown,
  policy: EncryptedFieldPolicy,
): string {
  if (policy.jsonStringify) {
    // For Json columns: stringify whatever the app handed us, then encrypt.
    // If the app already passed a string and it's an envelope, leave alone.
    if (isEncrypted(value)) return value as string;
    const serialised = JSON.stringify(value ?? null);
    return encrypt(serialised);
  }
  // Plain string column.
  if (typeof value !== "string") {
    // Pragmatic coercion: Prisma will reject non-strings on a String column
    // anyway, so this branch only hits if someone hands us a number/bool by
    // mistake. Stringify so the decrypt path stays well-defined.
    return encrypt(String(value));
  }
  return encrypt(value);
}

/**
 * Walk a single result row and decrypt every configured field that is
 * present and looks like an envelope. On decrypt failure we replace the
 * field with `null` and emit a structured warning to stderr — never throw,
 * because the read path must be tolerant of legacy plaintext rows during
 * the bridge period (see ENCRYPTION.md §Bridging Plan).
 */
function decryptReadRow(
  row: Record<string, unknown> | null,
  fields: EncryptedFieldPolicy[],
  modelName: string,
): void {
  if (!row || typeof row !== "object") return;
  for (const policy of fields) {
    if (!(policy.field in row)) continue;
    const raw = row[policy.field];
    if (raw === null || raw === undefined) continue;

    if (typeof raw !== "string") {
      // Non-string column value (e.g. Prisma decoded the Json field for us).
      // If the app stored an old plaintext JSON row pre-encryption, leave it.
      continue;
    }
    if (!isEncrypted(raw)) {
      // Legacy plaintext row from the bridge period. Pass through unchanged.
      continue;
    }

    try {
      const pt = decrypt(raw);
      row[policy.field] = policy.jsonStringify ? safeJsonParse(pt) : pt;
    } catch (err) {
      const id = typeof row["id"] === "string" ? row["id"] : undefined;
      console.warn(
        JSON.stringify({
          kind: "encryption_decrypt_failed",
          model: modelName,
          field: policy.field,
          id,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      row[policy.field] = null;
    }
  }
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    // The plaintext was supposed to be JSON but isn't — return as-is
    // rather than dropping the column. Surfaces as a string in the result.
    return s;
  }
}

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

/**
 * Build the Prisma extension that wires {@link ENCRYPTED_FIELDS} into the
 * client. Apply with `client.$extends(withEncryption())`; the resulting
 * client is what callers should import.
 *
 * Bypassed entirely when `RC_ENCRYPTION_DISABLED=true`. In that mode the
 * extension is still applied but every transform short-circuits — useful
 * for unit tests and local dev that doesn't want to deal with the env var.
 */
export function withEncryption(): ReturnType<typeof Prisma.defineExtension> {
  const disabled = isEncryptionDisabled();

  // Build the per-model `query` and `result` blocks dynamically. Prisma's
  // own typing is per-model and we deliberately don't try to narrow against
  // it — the runtime contract is what matters.
  const queryBlock: Record<string, Record<string, unknown>> = {};
  const resultBlock: Record<string, Record<string, unknown>> = {};

  for (const [model, fields] of POLICY_BY_MODEL.entries()) {
    const accessor = modelAccessor(model);

    // ------------ Write transforms ------------
    // We hook every operation that can carry a `data` payload. Each handler
    // mutates the args in place (cheaper than reconstructing) and forwards
    // to the underlying query.
    const writeHandlers: Record<
      string,
      (params: {
        args: Record<string, unknown>;
        query: (args: Record<string, unknown>) => Promise<unknown>;
      }) => Promise<unknown>
    > = {};

    if (!disabled) {
      const wrap =
        (kind: "create" | "update" | "upsert" | "createMany" | "updateMany") =>
        async (params: {
          args: Record<string, unknown>;
          query: (args: Record<string, unknown>) => Promise<unknown>;
        }) => {
          const args = params.args;
          if (kind === "upsert") {
            encryptWriteFields(
              args["create"] as Record<string, unknown> | undefined,
              fields,
            );
            encryptWriteFields(
              args["update"] as Record<string, unknown> | undefined,
              fields,
            );
          } else if (kind === "createMany") {
            const data = args["data"];
            if (Array.isArray(data)) {
              for (const item of data) {
                encryptWriteFields(
                  item as Record<string, unknown>,
                  fields,
                );
              }
            } else {
              encryptWriteFields(
                data as Record<string, unknown> | undefined,
                fields,
              );
            }
          } else {
            encryptWriteFields(
              args["data"] as Record<string, unknown> | undefined,
              fields,
            );
          }
          return params.query(args);
        };

      writeHandlers["create"] = wrap("create");
      writeHandlers["update"] = wrap("update");
      writeHandlers["upsert"] = wrap("upsert");
      writeHandlers["createMany"] = wrap("createMany");
      writeHandlers["updateMany"] = wrap("updateMany");
    }

    if (Object.keys(writeHandlers).length > 0) {
      queryBlock[accessor] = writeHandlers;
    }

    // ------------ Read transforms ------------
    // Prisma's `result` extension lets us define computed fields. We define
    // one per encrypted column whose `compute` reads the row's encrypted
    // value and returns plaintext. `needs` declares the dependency so
    // Prisma always selects the underlying column even when the caller
    // asks for a narrowed `select`.
    if (!disabled) {
      const computed: Record<string, unknown> = {};
      for (const policy of fields) {
        computed[policy.field] = {
          needs: { [policy.field]: true },
          compute(row: Record<string, unknown>) {
            const raw = row[policy.field];
            if (raw === null || raw === undefined) return raw;
            if (typeof raw !== "string") return raw;
            if (!isEncrypted(raw)) return raw;
            try {
              const pt = decrypt(raw);
              return policy.jsonStringify ? safeJsonParse(pt) : pt;
            } catch (err) {
              const id =
                typeof row["id"] === "string" ? row["id"] : undefined;
              console.warn(
                JSON.stringify({
                  kind: "encryption_decrypt_failed",
                  model,
                  field: policy.field,
                  id,
                  message: err instanceof Error ? err.message : String(err),
                }),
              );
              return null;
            }
          },
        };
      }
      resultBlock[accessor] = computed;
    }
  }

  // The Prisma extension typing for `query` / `result` is per-model — we
  // dispatch dynamically over the policy, so a pragmatic cast keeps the
  // factory generic without per-model handwriting. The runtime shape is
  // exactly what `defineExtension` expects; we cast the whole config object
  // because Prisma's `defineExtension` is overloaded and indexing one
  // overload's parameter list doesn't type-check.
  const config = {
    name: "researchcrafters-encryption",
    query: queryBlock,
    result: resultBlock,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Prisma.defineExtension(config as any);
}

// Re-export for callers that want to introspect the policy (e.g. account
// cascade plan tests verifying every PII column is covered).
export { decryptReadRow as _decryptReadRowForTests };
export { encryptWriteFields as _encryptWriteFieldsForTests };
