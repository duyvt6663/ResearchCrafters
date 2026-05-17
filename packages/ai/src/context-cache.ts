import type { MentorContext } from './types.js';
import type { VisibilityState } from './context-builder.js';

/**
 * Pluggable cache for stage-static `MentorContext` values.
 *
 * Loaders that hydrate a mentor context (artifact excerpts, rubric criteria,
 * branch feedback) read from content that is fixed for a given
 * `(packageVersionId, stageId, visibility)` triple. Repeating those loads on
 * every mentor turn is wasted work, so the runtime can hand a cache to
 * `buildMentorContext` and skip the loaders on hit.
 *
 * The cache surface is intentionally tiny so we can swap an in-memory map for
 * a Redis-backed implementation later without touching call sites.
 */
export interface MentorContextCache {
  get(key: string): MentorContext | undefined;
  /**
   * Store a context under `key`. Implementations may evict or expire entries
   * at their discretion; callers should not assume a write is durable.
   */
  set(key: string, value: MentorContext): void;
  /** Drop a single entry. Used by tests and by package re-publish hooks. */
  delete(key: string): void;
  /** Drop everything. Used by tests. */
  clear(): void;
}

export interface InMemoryMentorContextCacheOptions {
  /** Per-entry time-to-live in milliseconds. Defaults to 5 minutes. */
  ttlMs?: number;
  /**
   * Maximum number of entries. When exceeded, the oldest insertion is
   * evicted (FIFO). Defaults to 256.
   */
  maxEntries?: number;
  /** Test seam for deterministic expiry. Defaults to `Date.now`. */
  now?: () => number;
}

interface Entry {
  value: MentorContext;
  expiresAt: number;
}

/**
 * Single-process TTL cache. Safe to share across requests in one Node process;
 * multi-instance deployments need a shared store (tracked in
 * `backlog/05-mentor-safety.md` open gaps alongside the rate limiter).
 */
export class InMemoryMentorContextCache implements MentorContextCache {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, Entry>();

  constructor(options: InMemoryMentorContextCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 5 * 60_000;
    this.maxEntries = options.maxEntries ?? 256;
    this.now = options.now ?? Date.now;
  }

  get(key: string): MentorContext | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: MentorContext): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  /** Test-only view of current entry count. */
  size(): number {
    return this.entries.size;
  }
}

export interface MentorContextCacheKeyInput {
  stageId: string;
  packageVersionId: string;
  visibilityState: VisibilityState;
  artifactRefs: ReadonlyArray<string>;
  /**
   * Stable digest of the stage policy. The caller decides what to hash —
   * typically the JSON-stringified policy or a precomputed package digest.
   */
  policyDigest: string;
}

/**
 * Build a deterministic cache key for stage-static context.
 *
 * The key intentionally omits `attempt` (it's metadata on the resulting
 * context, not a loader input) and the learner id (context is per-stage, not
 * per-user). It includes the full visibility state because a learner who has
 * passed a stage sees more scopes than one who has only attempted it, and
 * those differing contexts must not collide in cache.
 */
export function mentorContextCacheKey(
  input: MentorContextCacheKeyInput,
): string {
  const visibility = `${input.visibilityState.hasAttempt ? 1 : 0}${input.visibilityState.hasPassed ? 1 : 0}${input.visibilityState.hasCompletedPackage ? 1 : 0}`;
  // Sort artifact refs so loader-order changes don't fragment the cache;
  // ordering is irrelevant to context contents.
  const refs = [...input.artifactRefs].sort().join('|');
  return [
    input.packageVersionId,
    input.stageId,
    visibility,
    input.policyDigest,
    refs,
  ].join('::');
}

/**
 * Deterministic FNV-1a 32-bit hash of any JSON-serialisable value, rendered
 * as an 8-character hex string. Used as a fallback digest when the caller
 * has not precomputed a package digest.
 */
export function fnv1aDigest(value: unknown): string {
  const json = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',') +
    '}'
  );
}
