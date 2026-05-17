/**
 * Production `SpendStore` wiring for the mentor pipeline.
 *
 * `packages/ai` ships only the `SpendStore` interface (so `checkBudget` in
 * `cost-cap.ts` is testable in isolation). The web app owns the concrete
 * implementation here per backlog/05-mentor-safety.md > Open gaps:
 *
 *   "Wire production `SpendStore` and `RateLimiter` implementations from
 *    the web app rather than relying on the interfaces shipped in
 *    `packages/ai`."
 *
 * `InMemoryMentorSpendStore` is suitable for single-process deployments
 * and the test/dev boot. It tracks per-user spend on a sliding 24h window
 * and accumulates per-package and per-stage totals. A Redis-backed
 * implementation behind the same interface is the open multi-instance
 * follow-up — see the README in `apps/web/lib/mentor/` (TODO file) for the
 * Redis shape.
 *
 * The store is intentionally minimal: `recordSpend(usd <= 0)` is a no-op,
 * which lets the gateway call site call `recordSpend` unconditionally
 * after every request (zero-cost / unpriced models drop on the floor).
 */

import type { SpendStore } from "@researchcrafters/ai";

export interface InMemoryMentorSpendStoreOptions {
  /** Sliding window for the per-user spend bucket. Defaults to 24h. */
  userDailyWindowMs?: number;
  /** Clock override. Defaults to `Date.now`. Tests inject a fixed clock. */
  now?: () => number;
}

interface UserSpendEntry {
  /** `{ ts, usd }` per-hit ledger so the window can prune by age. */
  hits: { ts: number; usd: number }[];
  /** Running sum so reads don't walk the entire hits list. */
  total: number;
}

const DEFAULT_USER_DAILY_WINDOW_MS = 24 * 60 * 60_000;

/**
 * In-memory `SpendStore`. Single-process only — multi-instance deployments
 * should swap in a Redis-backed implementation behind the same interface.
 */
export class InMemoryMentorSpendStore implements SpendStore {
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly userDaily: Map<string, UserSpendEntry> = new Map();
  private readonly packageTotal: Map<string, number> = new Map();
  private readonly stageTotal: Map<string, number> = new Map();

  constructor(options: InMemoryMentorSpendStoreOptions = {}) {
    this.windowMs = options.userDailyWindowMs ?? DEFAULT_USER_DAILY_WINDOW_MS;
    this.now = options.now ?? Date.now;
    if (this.windowMs <= 0) {
      throw new Error("mentor spend store windowMs must be positive");
    }
  }

  async getUserDailySpendUsd(userId: string): Promise<number> {
    return this.pruneAndTotalUser(userId);
  }

  async getPackageSpendUsd(packageId: string): Promise<number> {
    return this.packageTotal.get(packageId) ?? 0;
  }

  async getStageSpendUsd(packageId: string, stageId: string): Promise<number> {
    return this.stageTotal.get(stageKey(packageId, stageId)) ?? 0;
  }

  async recordSpend(args: {
    userId: string;
    packageId: string;
    stageId: string;
    usd: number;
  }): Promise<void> {
    if (!Number.isFinite(args.usd) || args.usd <= 0) {
      // No-cost requests (missing price, free tier, mock provider) are still
      // valid requests but contribute nothing to the running window. Skip
      // ledger writes so the per-user list stays compact.
      return;
    }
    const ts = this.now();
    const userEntry = this.userDaily.get(args.userId) ?? {
      hits: [],
      total: 0,
    };
    userEntry.hits.push({ ts, usd: args.usd });
    userEntry.total += args.usd;
    this.userDaily.set(args.userId, userEntry);

    this.packageTotal.set(
      args.packageId,
      (this.packageTotal.get(args.packageId) ?? 0) + args.usd,
    );
    const sk = stageKey(args.packageId, args.stageId);
    this.stageTotal.set(sk, (this.stageTotal.get(sk) ?? 0) + args.usd);
  }

  /** Test-only: clear every bucket. */
  reset(): void {
    this.userDaily.clear();
    this.packageTotal.clear();
    this.stageTotal.clear();
  }

  private pruneAndTotalUser(userId: string): number {
    const entry = this.userDaily.get(userId);
    if (!entry) return 0;
    const cutoff = this.now() - this.windowMs;
    let drop = 0;
    let droppedSum = 0;
    for (const hit of entry.hits) {
      if (hit.ts <= cutoff) {
        drop += 1;
        droppedSum += hit.usd;
      } else {
        break;
      }
    }
    if (drop > 0) {
      entry.hits.splice(0, drop);
      entry.total -= droppedSum;
      if (entry.total < 0) entry.total = 0;
    }
    return entry.total;
  }
}

function stageKey(packageId: string, stageId: string): string {
  return `${packageId}::${stageId}`;
}

let _processSpendStore: InMemoryMentorSpendStore | undefined;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Process-wide mentor spend store. Lazy so tests that exercise the route
 * can keep using their own stub by passing it through the runtime input.
 *
 * Tunables (env):
 *   - `MENTOR_SPEND_USER_WINDOW_MS` (default 24h)
 */
export function defaultMentorSpendStore(): SpendStore {
  if (!_processSpendStore) {
    _processSpendStore = new InMemoryMentorSpendStore({
      userDailyWindowMs: parsePositiveInt(
        process.env["MENTOR_SPEND_USER_WINDOW_MS"],
        DEFAULT_USER_DAILY_WINDOW_MS,
      ),
    });
  }
  return _processSpendStore;
}

/** Test-only: reset the process-wide store between suites. */
export function resetDefaultMentorSpendStoreForTests(): void {
  _processSpendStore = undefined;
}
