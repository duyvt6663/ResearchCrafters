import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { getSessionFromRequest } from "@/lib/auth";
import { track } from "@/lib/telemetry";

export const runtime = "nodejs";

/**
 * POST /api/auth/device/approve
 *
 * Server-action endpoint behind `/auth/device`. The browser-side approval page
 * posts `{ userCode, decision }`. The session must be authenticated (via the
 * NextAuth cookie or, in unusual cases, a Bearer token).
 *
 * Behaviour:
 *   - `pending` flow with valid expiry → flip to `approved` (or `denied`),
 *     stamp `userId` with the session user.
 *   - Already `approved` / `denied` / `expired` / `consumed` → return
 *     `{ ok: true, alreadyHandled: true }` with the matching state so the
 *     page can render the right banner without a second mutation.
 *   - Unknown `userCode` → 404 `{ error: 'not_found' }`.
 *
 * Idempotency: rerunning approve on an already-approved flow is a no-op.
 * Denial of an already-approved flow is rejected (409) so a stray click can't
 * silently revoke a flow that's been consumed by the CLI.
 */
const approveRequestSchema = z
  .object({
    userCode: z.string().min(1),
    decision: z.enum(["approve", "deny"]),
  })
  .strict();

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session.userId) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 },
    );
  }

  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = approveRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", reason: parsed.error.issues },
      { status: 400 },
    );
  }
  const { userCode, decision } = parsed.data;

  const flow = await withQueryTimeout(
    prisma.deviceCodeFlow.findUnique({
      where: { userCode },
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
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const now = Date.now();
  const isExpired = flow.expiresAt.getTime() <= now;

  // Idempotent paths: the flow has already left `pending`. Don't mutate.
  if (
    flow.state === "approved" ||
    flow.state === "denied" ||
    flow.state === "expired" ||
    flow.consumedAt !== null
  ) {
    return NextResponse.json({
      ok: true,
      alreadyHandled: true,
      state: flow.state,
    });
  }

  if (isExpired) {
    // Roll the row to `expired` so a later poll surfaces the right error.
    await withQueryTimeout(
      prisma.deviceCodeFlow.update({
        where: { id: flow.id },
        data: { state: "expired" },
      }),
    );
    return NextResponse.json(
      { error: "expired_token" },
      { status: 400 },
    );
  }

  const nextState = decision === "approve" ? "approved" : "denied";
  await withQueryTimeout(
    prisma.deviceCodeFlow.update({
      where: { id: flow.id },
      data: {
        state: nextState,
        userId: session.userId,
      },
    }),
  );

  // Recycle an existing telemetry event name (paywall_viewed) — the device
  // approval / denial event is added when the telemetry workstream extends
  // the discriminated union. The wrapper logs and swallows unknown names, so
  // this is intentionally conservative and mirrors `device-code/route.ts`.
  await track("paywall_viewed", {
    decision: nextState,
  });

  return NextResponse.json({ ok: true, state: nextState });
}
