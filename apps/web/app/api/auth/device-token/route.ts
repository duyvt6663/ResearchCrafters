import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import {
  deviceTokenRequestSchema,
  deviceTokenResponseSchema,
} from "@/lib/api-contract";

export const runtime = "nodejs";

const SESSION_TTL_DAYS = 30;
const SEED_FIXTURE_EMAIL = "fixture@researchcrafters.dev";

function urlSafeRandom(bytes: number): string {
  return randomBytes(bytes)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * POST /api/auth/device-token
 *
 * The CLI polls this every `interval` seconds with the `deviceCode` returned
 * from `/api/auth/device-code`. Lifecycle:
 *
 *   - `pending`   -> 202 `{ error: 'authorization_pending' }`
 *   - `approved`  -> 200 `{ token, expiresAt, email }` and the flow is
 *                    consumed (so the same deviceCode cannot mint a second
 *                    session). The token is the matching `Session.sessionToken`
 *                    inserted via the Auth.js database session strategy.
 *   - `denied`    -> 400 `{ error: 'access_denied' }`
 *   - `expired` (or past `expiresAt`) -> 400 `{ error: 'expired_token' }`
 *
 * Dev convenience
 * ---------------
 * When `NODE_ENV === 'development'` the body may include
 * `developer_force_approve: true`. The flow is then immediately approved
 * against the seed fixture user (`fixture@researchcrafters.dev`) and a session
 * is minted in the same response. This exists purely so a fresh checkout can
 * `researchcrafters login` without the browser approval UI being wired up. In
 * any other NODE_ENV the flag is ignored.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = deviceTokenRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", reason: parsed.error.issues },
      { status: 400 },
    );
  }

  const deviceCode = parsed.data.deviceCode ?? parsed.data.device_code;
  if (!deviceCode) {
    return NextResponse.json(
      { error: "bad_request", reason: "missing_device_code" },
      { status: 400 },
    );
  }

  const flow = await withQueryTimeout(
    prisma.deviceCodeFlow.findUnique({
      where: { deviceCode },
      select: {
        id: true,
        state: true,
        userId: true,
        expiresAt: true,
        consumedAt: true,
      },
    }),
  );
  if (!flow) {
    return NextResponse.json(
      deviceTokenResponseSchema.parse({ error: "expired_token" }),
      { status: 400 },
    );
  }

  // Dev-only: force the flow to `approved` against the seed fixture user.
  if (
    parsed.data.developer_force_approve === true &&
    process.env["NODE_ENV"] === "development" &&
    flow.state === "pending" &&
    flow.expiresAt.getTime() > Date.now()
  ) {
    const fixture = await withQueryTimeout(
      prisma.user.findFirst({
        where: { email: SEED_FIXTURE_EMAIL },
        select: { id: true },
      }),
    );
    if (fixture) {
      await withQueryTimeout(
        prisma.deviceCodeFlow.update({
          where: { id: flow.id },
          data: { state: "approved", userId: fixture.id },
        }),
      );
      flow.state = "approved";
      flow.userId = fixture.id;
    }
  }

  const now = Date.now();
  const isExpired = flow.expiresAt.getTime() <= now;

  if (isExpired && flow.state !== "approved") {
    if (flow.state !== "expired") {
      await withQueryTimeout(
        prisma.deviceCodeFlow.update({
          where: { id: flow.id },
          data: { state: "expired" },
        }),
      );
    }
    return NextResponse.json(
      deviceTokenResponseSchema.parse({ error: "expired_token" }),
      { status: 400 },
    );
  }

  if (flow.state === "denied") {
    return NextResponse.json(
      deviceTokenResponseSchema.parse({ error: "access_denied" }),
      { status: 400 },
    );
  }

  if (flow.state === "expired") {
    return NextResponse.json(
      deviceTokenResponseSchema.parse({ error: "expired_token" }),
      { status: 400 },
    );
  }

  if (flow.state === "pending") {
    return NextResponse.json(
      deviceTokenResponseSchema.parse({ error: "authorization_pending" }),
      { status: 202 },
    );
  }

  // approved
  if (!flow.userId) {
    return NextResponse.json(
      deviceTokenResponseSchema.parse({ error: "access_denied" }),
      { status: 400 },
    );
  }

  if (flow.consumedAt) {
    // The same deviceCode was already exchanged for a session; refuse a
    // second mint. The CLI should treat this as expired and re-run login.
    return NextResponse.json(
      deviceTokenResponseSchema.parse({ error: "expired_token" }),
      { status: 400 },
    );
  }

  const expires = new Date(now + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const sessionToken = urlSafeRandom(32);
  await withQueryTimeout(
    prisma.session.create({
      data: {
        sessionToken,
        userId: flow.userId,
        expires,
      },
    }),
  );

  await withQueryTimeout(
    prisma.deviceCodeFlow.update({
      where: { id: flow.id },
      data: { consumedAt: new Date() },
    }),
  );

  const user = await withQueryTimeout(
    prisma.user.findUnique({
      where: { id: flow.userId },
      select: { email: true },
    }),
  );

  const body = deviceTokenResponseSchema.parse({
    token: sessionToken,
    expiresAt: expires.toISOString(),
    email: user?.email ?? null,
  });
  return NextResponse.json(body);
}
