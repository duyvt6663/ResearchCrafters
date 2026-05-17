/**
 * Production `MentorRateLimiter` wiring for the mentor pipeline.
 *
 * `packages/05-mentor-safety.md` > Mentor Interaction calls for:
 *   "Rate-limit mentor requests per user and package."
 *
 * `packages/ai` deliberately does not ship a rate-limiter interface: the
 * limiter has runtime dependencies (Redis in production, in-memory in dev)
 * that belong on the web app side of the seam. This module defines both
 * the interface and the in-memory implementation here so the runtime in
 * `apps/web/lib/mentor-runtime.ts` consumes a web-owned production
 * implementation rather than re-using the shims that `packages/ai` keeps
 * for its own unit tests.
 *
 * Two sliding windows are checked on every request:
 *   - per user (across all packages they touch)
 *   - per (user, package) pair
 *
 * The first prevents one learner from saturating the platform gateway
 * quota; the second prevents drilling a single package's authored budget.
 * Both windows are independent — a request that passes one but trips the
 * other is refused.
 */

export interface MentorRateLimitCheckInput {
  userId: string;
  packageId: string;
}

export type MentorRateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      /** Which window tripped; surfaces in telemetry + refusal copy. */
      scope: "per_user" | "per_user_package";
      /** Best-effort seconds until the offending window refreshes. */
      retryAfterSeconds: number;
    };

export interface MentorRateLimiter {
  check(input: MentorRateLimitCheckInput): Promise<MentorRateLimitDecision>;
}

export interface InMemoryMentorRateLimiterOptions {
  /** Max requests per user across all packages in `windowMs`. */
  perUserLimit?: number;
  /** Max requests per (user, package) pair in `windowMs`. */
  perUserPackageLimit?: number;
  /** Sliding-window length in milliseconds. */
  windowMs?: number;
  /** Clock override. Defaults to `Date.now`. */
  now?: () => number;
}

interface HitWindow {
  hits: number[];
}

const DEFAULT_PER_USER_LIMIT = 60;
const DEFAULT_PER_USER_PACKAGE_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60_000;

/**
 * Sliding-window mentor rate limiter that keeps hit timestamps in memory.
 *
 * Single-process only. Multi-instance deployments swap a Redis-backed
 * limiter behind the same interface; the open-gap note in
 * `backlog/05-mentor-safety.md` tracks that follow-up.
 */
export class InMemoryMentorRateLimiter implements MentorRateLimiter {
  private readonly perUserLimit: number;
  private readonly perUserPackageLimit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly perUser: Map<string, HitWindow> = new Map();
  private readonly perUserPackage: Map<string, HitWindow> = new Map();

  constructor(options: InMemoryMentorRateLimiterOptions = {}) {
    this.perUserLimit = options.perUserLimit ?? DEFAULT_PER_USER_LIMIT;
    this.perUserPackageLimit =
      options.perUserPackageLimit ?? DEFAULT_PER_USER_PACKAGE_LIMIT;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = options.now ?? Date.now;
    if (this.perUserLimit <= 0 || this.perUserPackageLimit <= 0) {
      throw new Error("mentor rate limits must be positive");
    }
    if (this.windowMs <= 0) {
      throw new Error("mentor rate limit windowMs must be positive");
    }
  }

  async check(
    input: MentorRateLimitCheckInput,
  ): Promise<MentorRateLimitDecision> {
    const now = this.now();
    const cutoff = now - this.windowMs;

    const userKey = input.userId;
    const pairKey = `${input.userId}::${input.packageId}`;

    const userWindow = this.getWindow(this.perUser, userKey);
    const pairWindow = this.getWindow(this.perUserPackage, pairKey);

    prune(userWindow, cutoff);
    prune(pairWindow, cutoff);

    // Check the narrower (per-pair) window first so the telemetry reason
    // attributes the refusal to the tighter cap.
    if (pairWindow.hits.length >= this.perUserPackageLimit) {
      return {
        allowed: false,
        scope: "per_user_package",
        retryAfterSeconds: retryAfter(pairWindow, cutoff),
      };
    }
    if (userWindow.hits.length >= this.perUserLimit) {
      return {
        allowed: false,
        scope: "per_user",
        retryAfterSeconds: retryAfter(userWindow, cutoff),
      };
    }

    userWindow.hits.push(now);
    pairWindow.hits.push(now);
    return { allowed: true };
  }

  /** Test-only: clear every window. */
  reset(): void {
    this.perUser.clear();
    this.perUserPackage.clear();
  }

  private getWindow(map: Map<string, HitWindow>, key: string): HitWindow {
    const existing = map.get(key);
    if (existing) return existing;
    const fresh: HitWindow = { hits: [] };
    map.set(key, fresh);
    return fresh;
  }
}

function prune(window: HitWindow, cutoff: number): void {
  let drop = 0;
  for (const ts of window.hits) {
    if (ts <= cutoff) drop += 1;
    else break;
  }
  if (drop > 0) window.hits.splice(0, drop);
}

function retryAfter(window: HitWindow, cutoff: number): number {
  // The earliest hit still in the window ages out at `oldest + windowMs`;
  // since `cutoff = now - windowMs`, the wait is `oldest - cutoff` ms.
  const oldest = window.hits[0];
  if (oldest === undefined) return 0;
  return Math.max(1, Math.ceil((oldest - cutoff) / 1000));
}

let _processRateLimiter: InMemoryMentorRateLimiter | undefined;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Process-wide mentor rate limiter. Tunables (env):
 *   - `MENTOR_RATE_PER_USER_LIMIT` (default 60 / minute)
 *   - `MENTOR_RATE_PER_USER_PACKAGE_LIMIT` (default 30 / minute)
 *   - `MENTOR_RATE_WINDOW_MS` (default 60000)
 */
export function defaultMentorRateLimiter(): MentorRateLimiter {
  if (!_processRateLimiter) {
    _processRateLimiter = new InMemoryMentorRateLimiter({
      perUserLimit: parsePositiveInt(
        process.env["MENTOR_RATE_PER_USER_LIMIT"],
        DEFAULT_PER_USER_LIMIT,
      ),
      perUserPackageLimit: parsePositiveInt(
        process.env["MENTOR_RATE_PER_USER_PACKAGE_LIMIT"],
        DEFAULT_PER_USER_PACKAGE_LIMIT,
      ),
      windowMs: parsePositiveInt(
        process.env["MENTOR_RATE_WINDOW_MS"],
        DEFAULT_WINDOW_MS,
      ),
    });
  }
  return _processRateLimiter;
}

/** Test-only: reset the process-wide limiter between suites. */
export function resetDefaultMentorRateLimiterForTests(): void {
  _processRateLimiter = undefined;
}
