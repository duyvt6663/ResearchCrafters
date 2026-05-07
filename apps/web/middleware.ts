/**
 * Edge middleware. Responsibilities:
 *
 * 1. Run NextAuth's session check (the `auth` export doubles as a middleware
 *    factory). The Prisma-backed session is read inside route handlers; here
 *    we only consult the session cookie so unauthenticated requests are
 *    cheap.
 * 2. Inject a request id so logs can be correlated end-to-end.
 * 3. Set a Content-Security-Policy header sized to the environment.
 *
 * CSP dev / prod split:
 *   - In `development`, Next.js's React Refresh and Tailwind v4's runtime
 *     style injection require `'unsafe-eval'` and `'unsafe-inline'` for
 *     `script-src` / `style-src`. We allow these only when
 *     `process.env.NODE_ENV === "development"`.
 *   - In `production`, we generate a fresh nonce per request and emit a
 *     strict policy that forbids inline/eval. The nonce is exposed via the
 *     `x-csp-nonce` header so server components / route handlers can read it
 *     when they need to mark their own inline tags.
 *
 * `img-src` allowlists `https://avatars.githubusercontent.com` for the
 * GitHub OAuth profile-picture path through the catalog header.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";

function generateNonce(): string {
  // crypto.randomUUID is available on Edge runtime; strip dashes for a
  // compact nonce string.
  return crypto.randomUUID().replace(/-/g, "");
}

function buildCsp(args: { isDev: boolean; nonce: string }): string {
  const { isDev, nonce } = args;
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const styleSrc = isDev
    ? "style-src 'self' 'unsafe-inline'"
    : `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`;
  // Notes:
  //  - `connect-src` allows same-origin XHR/fetch and the websocket Next dev
  //    server uses for HMR. Production strips the ws upgrade.
  //  - `font-src` allows the inlined data: URIs Tailwind emits, plus the
  //    Google Fonts CDN we preconnect to in the root layout.
  const connectSrc = isDev
    ? "connect-src 'self' ws: wss:"
    : "connect-src 'self'";
  return [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "img-src 'self' data: blob: https://avatars.githubusercontent.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    connectSrc,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export default auth((req) => {
  const res = NextResponse.next();

  const requestId = crypto.randomUUID();
  res.headers.set("x-request-id", requestId);

  const isDev = process.env.NODE_ENV === "development";
  const nonce = generateNonce();
  res.headers.set("content-security-policy", buildCsp({ isDev, nonce }));
  if (!isDev) {
    // Surface the nonce to downstream handlers that may need to render
    // inline scripts (analytics shims, etc.). Dev does not bother because
    // the policy already permits 'unsafe-inline'.
    res.headers.set("x-csp-nonce", nonce);
  }

  // Make the resolved auth state available to downstream code via a header
  // for debugging/tracing only — never trust this header for authorization.
  if (req.auth?.user) {
    res.headers.set(
      "x-rc-auth",
      (req.auth.user as { id?: string }).id ?? "anonymous",
    );
  }

  return res;
});

export const config = {
  // Skip Next.js internals and static assets. Auth-required gating itself is
  // delegated to per-route `permissions.canAccess` calls.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
