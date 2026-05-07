// POST /api/account/delete
//
// Body: { confirm: true, reason?: string }
//
// Runs the account-cascade plan (see lib/account-cascade.ts). On success the
// session cookie is invalidated by setting an expired Set-Cookie header so
// the browser stops sending the now-invalid token. Clients should then
// redirect to `/`.
//
// Telemetry: see ../export/route.ts header for the same contract decision.
// We log a structured `account_deleted` event to stdout pending the typed
// telemetry event landing in `@researchcrafters/telemetry`.

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { deleteAccount } from "@/lib/account-cascade";

export const runtime = "nodejs";

interface DeleteBody {
  confirm?: boolean;
  reason?: string;
}

// Auth.js v5 cookie names. Both the secure and insecure forms are emitted on
// the response so dev (HTTP) and prod (HTTPS) browsers both clear the cookie.
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  // Auth.js v4 fallbacks.
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

function expiredCookie(name: string): string {
  // Path=/ ensures the cookie is cleared regardless of the page that posted
  // the delete. SameSite=Lax matches Auth.js's default for the session
  // cookie; an expired cookie's SameSite is irrelevant for clearing but we
  // keep it consistent so middleware diff-detection treats this as a real
  // overwrite.
  const secure = name.startsWith("__Secure-") ? "; Secure" : "";
  return `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session.userId) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 },
    );
  }

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400 },
    );
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "confirmation_required" },
      { status: 400 },
    );
  }

  const reason = typeof body.reason === "string" ? body.reason : null;
  const result = await deleteAccount(
    reason === null
      ? { userId: session.userId }
      : { userId: session.userId, reason },
  );

   
  console.log(
    JSON.stringify({
      kind: "telemetry",
      event: "account_deleted",
      payload: {
        userId: session.userId,
        counts: result.counts,
        reason: result.reason,
      },
      ts: result.completedAt,
    }),
  );

  const response = NextResponse.json({ deleted: true }, { status: 200 });
  for (const name of SESSION_COOKIE_NAMES) {
    response.headers.append("Set-Cookie", expiredCookie(name));
  }
  return response;
}
