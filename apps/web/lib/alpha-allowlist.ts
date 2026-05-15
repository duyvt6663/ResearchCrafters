// Alpha access gate.
//
// During the alpha we run with manual, email-based access control instead of
// a full billing flow. `ALPHA_ACCESS_ALLOWLIST` is a comma- or
// newline-separated list of emails permitted to sign in. When the variable
// is unset or empty the gate is OFF and any authenticated user is allowed
// (this preserves local-dev and pre-alpha behaviour).
//
// Matching is case-insensitive and trims whitespace; entries that do not
// contain "@" are ignored so a stray "TODO" or comment line is harmless.

const ALLOWLIST_ENV = "ALPHA_ACCESS_ALLOWLIST";

export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0 && entry.includes("@"));
}

export type AlphaAccessDecision =
  | { allowed: true; reason: "allowlist_disabled" | "email_on_allowlist" }
  | { allowed: false; reason: "missing_email" | "not_on_allowlist" };

export function decideAlphaAccess(
  email: string | null | undefined,
  rawAllowlist: string | undefined | null,
): AlphaAccessDecision {
  const allowlist = parseAllowlist(rawAllowlist);
  if (allowlist.length === 0) {
    return { allowed: true, reason: "allowlist_disabled" };
  }
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) {
    return { allowed: false, reason: "missing_email" };
  }
  if (allowlist.includes(normalized)) {
    return { allowed: true, reason: "email_on_allowlist" };
  }
  return { allowed: false, reason: "not_on_allowlist" };
}

export function isAlphaAccessAllowed(
  email: string | null | undefined,
): boolean {
  return decideAlphaAccess(email, process.env[ALLOWLIST_ENV]).allowed;
}
