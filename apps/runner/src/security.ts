import { resolve, sep } from 'node:path';
import { scrubLogs } from './log-scrub.js';

/**
 * Security policy primitives. Pure functions where possible; effectful parts
 * (rate limiting, persistence) live behind interfaces so tests can swap mocks.
 */

/**
 * Allowlist of env var names that are safe to forward into the sandbox. Any
 * variable not on this list is dropped. The runner never forwards platform
 * secrets, GitHub tokens, AWS creds, or DB URLs.
 */
const SAFE_ENV_KEYS: ReadonlyArray<string> = [
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'LC_ALL',
  'TZ',
  'PYTHONPATH',
  'PYTHONUNBUFFERED',
  'NODE_OPTIONS',
];

/**
 * Strict deny-list — even if these somehow ended up in the allowlist they
 * would still be removed.
 */
const NEVER_FORWARD = new Set([
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'DATABASE_URL',
  'POSTGRES_URL',
  'REDIS_URL',
  'STRIPE_SECRET_KEY',
  'JWT_SECRET',
  'NEXTAUTH_SECRET',
]);

export function stripSecretsFromEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    if (NEVER_FORWARD.has(key)) continue;
    const value = source[key];
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Default upload size (bytes) for submission bundles. Per TODOS/03 the runner
 * enforces a maximum upload size; this constant is the runtime cap. The web
 * app and CLI also enforce on their side.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export class UploadTooLargeError extends Error {
  constructor(public readonly sizeBytes: number, public readonly limitBytes: number) {
    super(`upload size ${sizeBytes}B exceeds limit ${limitBytes}B`);
    this.name = 'UploadTooLargeError';
  }
}

export function enforceMaxUploadSize(
  sizeBytes: number,
  limitBytes: number = MAX_UPLOAD_BYTES,
): void {
  if (sizeBytes > limitBytes) {
    throw new UploadTooLargeError(sizeBytes, limitBytes);
  }
}

/** Network policy values matching `runner.yaml` schema. */
export type NetworkPolicy = 'none' | 'restricted';

export interface NetworkDecision {
  allowed: boolean;
  reason: string;
}

export function evaluateNetworkPolicy(policy: NetworkPolicy): NetworkDecision {
  if (policy === 'none') {
    return { allowed: false, reason: 'network disabled by stage policy' };
  }
  // 'restricted' means the sandbox enforces an allowlist at the network layer.
  // The runner here only signals that egress is permitted *if* the allowlist
  // is honoured by the sandbox driver.
  return { allowed: true, reason: 'restricted egress' };
}

/**
 * Rate limiter interface. The web app wires this to Redis; tests use an
 * in-memory counter.
 */
export interface RateLimiter {
  check(args: {
    userId: string;
    packageId: string;
    /** Optional IP for IP-level shedding. */
    ip?: string;
  }): Promise<{ allowed: boolean; reason?: string }>;
}

/** Tiny in-memory rate limiter for tests. NOT for production. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();
  constructor(private readonly limit: number = 30) {}
  async check(args: {
    userId: string;
    packageId: string;
    ip?: string;
  }): Promise<{ allowed: boolean; reason?: string }> {
    const key = `${args.userId}:${args.packageId}`;
    const current = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, current);
    if (current > this.limit) {
      return { allowed: false, reason: 'rate limit exceeded' };
    }
    return { allowed: true };
  }
}

/** Combined "scrub before persist" helper. */
export function scrubForPersistence(text: string): { text: string; triggered: string[] } {
  return scrubLogs(text);
}

/**
 * Returns true if `child` resolves to a path strictly inside `parent`. Used by
 * `LocalFsSandbox` to refuse path-traversal entries in workspace bundles.
 *
 * Both inputs are resolved to absolute paths before comparison so callers do
 * not need to pre-normalize. A `child` equal to `parent` is treated as inside.
 */
export function isPathInside(child: string, parent: string): boolean {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);
  if (resolvedChild === resolvedParent) return true;
  const parentWithSep = resolvedParent.endsWith(sep)
    ? resolvedParent
    : resolvedParent + sep;
  return resolvedChild.startsWith(parentWithSep);
}
