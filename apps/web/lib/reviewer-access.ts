// Reviewer-role gate for human override endpoints.
//
// The product does not yet have a `User.role` column or a `Role` table; until
// that lands, reviewer permission is declared via the `REVIEWER_USER_IDS`
// environment variable — a comma-separated list of user ids that may invoke
// reviewer-only endpoints (e.g. POST /api/grades/[id]/override).
//
// Keeping the helper isolated means the future migration to a DB-backed role
// system only has to change this file; route handlers and tests stay stable.

function parseAllowlist(raw: string | undefined): ReadonlySet<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

/**
 * Returns true when the supplied userId is on the configured reviewer
 * allowlist. Returns false for null / empty user ids and when the env var is
 * unset (default-deny).
 */
export function isReviewer(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const allowlist = parseAllowlist(process.env["REVIEWER_USER_IDS"]);
  return allowlist.has(userId);
}
