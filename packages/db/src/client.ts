import { PrismaClient, type Prisma } from "@prisma/client";
import { withEncryption } from "./encrypted-fields.js";

/**
 * Default query timeout (ms) applied to every Prisma operation routed through
 * {@link withQueryTimeout}. 10s is comfortably above expected p99 for our hot
 * paths (catalog, enrollment, grade lookup) while still cutting off runaway
 * queries before they pile up against the worker pool.
 */
export const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

const PRISMA_LOG_LEVELS: Prisma.LogLevel[] =
  process.env["NODE_ENV"] === "production"
    ? ["warn", "error"]
    : ["warn", "error"];

/**
 * Build a configured PrismaClient with the at-rest encryption extension
 * already applied. The exported `prisma` singleton is the extended client —
 * consumers (`apps/web`, `apps/worker`, `apps/runner`, `packages/telemetry`)
 * import this binding and never see plaintext envelope tokens. The
 * extension handles encrypt-on-write / decrypt-on-read for every column
 * listed in `ENCRYPTED_FIELDS` (see `packages/db/ENCRYPTION.md`).
 *
 * Typing pragmatics: Prisma's `$extends` returns a heavily-inferred
 * `DynamicClientExtensionThis<...>` type whose per-model delegate accessors
 * are not assignable to plain `PrismaClient` even though the runtime shape
 * is a strict superset. We cast back to `PrismaClient` so downstream
 * consumers (`apps/web`, `apps/worker`, …) keep their existing
 * `PrismaClient`-typed helpers without changes. The encryption transforms
 * still fire — they're attached to the runtime instance, not the static
 * type. See `ENCRYPTION.md` for the contract.
 */
function createPrismaClient(): PrismaClient {
  const baseClient = new PrismaClient({
    log: PRISMA_LOG_LEVELS,
  });
  // The extended client's static type doesn't match `PrismaClient` exactly
  // (Prisma 5's extension API widens the return type), but the runtime
  // shape is identical — the extension only adds per-row computed fields
  // and per-operation interceptors. The `as unknown as PrismaClient` cast
  // is the same pragmatic-bridge cast Prisma's own docs recommend when you
  // want a stable singleton type across the codebase.
  return baseClient.$extends(withEncryption()) as unknown as PrismaClient;
}

/**
 * Alias kept for downstream consumers that want to make the
 * "this client has the encryption extension" intent visible at use sites.
 * Functionally equivalent to {@link PrismaClient}.
 */
export type ExtendedPrismaClient = PrismaClient;

type GlobalWithPrisma = typeof globalThis & {
  __researchcraftersPrisma?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalWithPrisma;

export const prisma: PrismaClient =
  globalForPrisma.__researchcraftersPrisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.__researchcraftersPrisma = prisma;
}

/**
 * Wrap a Prisma promise (or any promise) with a hard timeout so a stuck
 * connection cannot block a request indefinitely. Resolves with the original
 * value or rejects with a {@link QueryTimeoutError}.
 *
 * Note: this races the promise but does not cancel the underlying query.
 * Postgres-level cancellation requires `pg_cancel_backend`, which is out of
 * scope here — this guard exists to bound caller latency.
 */
export class QueryTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Prisma query exceeded ${timeoutMs}ms timeout`);
    this.name = "QueryTimeoutError";
  }
}

export async function withQueryTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new QueryTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return (await Promise.race([operation, timeout])) as T;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Convenience helper for $transaction calls that should also be bounded.
 * Prisma's own `timeout` option controls the interactive-tx window; this
 * additionally bounds the wrapping promise so callers see a consistent error.
 *
 * The callback receives the extended singleton; we widen the parameter type
 * to `PrismaClient` for back-compat with consumers that already type their
 * helpers against the un-extended generated client (e.g.
 * `apps/web/lib/account-cascade.ts`'s `AccountCascadePrisma`). The encryption
 * extension is invisible at the call site — it just transparently encrypts
 * writes and decrypts reads on the configured columns.
 */
export async function runWithTimeout<T>(
  fn: (client: PrismaClient) => Promise<T>,
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<T> {
  return withQueryTimeout(fn(prisma), timeoutMs);
}

export type { PrismaClient };
