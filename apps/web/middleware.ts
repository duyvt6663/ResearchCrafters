import { NextResponse, type NextRequest } from "next/server";

// Lightweight middleware. Responsibilities:
// 1. Inject a request id so logs can be correlated.
// 2. Touch the auth cookie (stub) so downstream code has a consistent surface.
// 3. Set a CSP header that allows the app's own assets and inline styles
//    Tailwind requires.
//
// Real auth provider hand-off and a stricter CSP nonce flow will replace this
// in a later workstream.

export function middleware(req: NextRequest): NextResponse {
  const res = NextResponse.next();

  const requestId = crypto.randomUUID();
  res.headers.set("x-request-id", requestId);

  // CSP: own origin only, with the unsafe-inline allowance Tailwind v4 needs
  // for its runtime-injected styles in dev. Production builds will tighten
  // this with a nonce.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  res.headers.set("content-security-policy", csp);

  // Stub session cookie: keep the cookie present if it exists; do not mint one.
  const session = req.cookies.get("rc_session");
  if (session) {
    res.cookies.set("rc_session", session.value, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
