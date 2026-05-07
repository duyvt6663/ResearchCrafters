import { PrismaClient, type Prisma } from "@prisma/client";

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
 * Build a configured PrismaClient. Singleton-ed via globalThis so Next.js dev
 * mode and tsx watch don't leak connections on every reload.
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: PRISMA_LOG_LEVELS,
  });
}

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
 */
export async function runWithTimeout<T>(
  fn: (client: PrismaClient) => Promise<T>,
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<T> {
  return withQueryTimeout(fn(prisma), timeoutMs);
}

export type { PrismaClient };
