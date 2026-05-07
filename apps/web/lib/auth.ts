// Server-side session helper. Backed by NextAuth v5 (`auth()` from `@/auth`).
//
// The shape returned here is the contract every route handler relies on:
//   { userId: string | null; user?: { id, email, name, image } | null }
//
// Pages and API routes that already call `getSession()` keep working without
// change; the value of `userId` simply switches from a cookie-derived stub
// to the live database session.
//
// Bearer-token support
// --------------------
// The CLI authenticates with `Authorization: Bearer <sessionToken>` instead of
// the cookie. We accept that header by looking up the matching `Session` row
// (Auth.js database session strategy already stores `sessionToken` values
// keyed by user) and returning the same `{ userId, user }` shape that the
// cookie path produces. Callers that need explicit access to the incoming
// `Request` (route handlers, middleware-flavoured code) can use
// `getSessionFromRequest(req)`; the parameterless `getSession()` keeps working
// for code that only needs the cookie session.

import { auth } from "@/auth";
import { prisma, withQueryTimeout } from "@researchcrafters/db";

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

export type Session = {
  userId: string | null;
  user?: SessionUser | null;
};

const EMPTY_SESSION: Session = { userId: null, user: null };

function extractBearerToken(req: Request | undefined | null): string | null {
  if (!req) return null;
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1]?.trim();
  return token && token.length > 0 ? token : null;
}

async function sessionFromBearerToken(token: string): Promise<Session> {
  try {
    const row = await withQueryTimeout(
      prisma.session.findUnique({
        where: { sessionToken: token },
        select: {
          expires: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
            },
          },
        },
      }),
    );
    if (!row || !row.user) return EMPTY_SESSION;
    if (row.expires.getTime() <= Date.now()) return EMPTY_SESSION;
    return {
      userId: row.user.id,
      user: {
        id: row.user.id,
        email: row.user.email ?? null,
        name: row.user.name ?? null,
        image: row.user.image ?? null,
      },
    };
  } catch {
    // DB unreachable: behave like cookie path and return an empty session so
    // routes default-deny rather than crash.
    return EMPTY_SESSION;
  }
}

async function sessionFromCookie(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    return EMPTY_SESSION;
  }

  // NextAuth's session.user.id is populated by the Prisma adapter when using
  // the database session strategy. Fall back to null defensively if a
  // misconfigured provider produces a session without an id.
  const id = (session.user as { id?: string | null }).id ?? null;
  if (!id) {
    return EMPTY_SESSION;
  }

  return {
    userId: id,
    user: {
      id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    },
  };
}

/**
 * Resolve the current session. When a `Request` is supplied we first check for
 * an `Authorization: Bearer <sessionToken>` header (the CLI path); otherwise
 * we fall back to the NextAuth cookie session. Every route in the app that
 * calls this should keep working unchanged — the return shape is unchanged.
 */
export async function getSession(req?: Request): Promise<Session> {
  const bearer = extractBearerToken(req ?? null);
  if (bearer) {
    const fromBearer = await sessionFromBearerToken(bearer);
    if (fromBearer.userId) return fromBearer;
    // Invalid / expired bearer token: fall through to the cookie path so a
    // mixed browser+CLI client (rare) still resolves to the cookie session.
  }
  return sessionFromCookie();
}

/**
 * Convenience wrapper used by route handlers that always have a `Request`
 * available. Identical to calling `getSession(req)` — kept as a named export
 * so call sites read clearly.
 */
export async function getSessionFromRequest(req: Request): Promise<Session> {
  return getSession(req);
}
