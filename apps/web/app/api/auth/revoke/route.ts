import { NextResponse } from "next/server";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import {
  revokeRequestSchema,
  revokeResponseSchema,
} from "@/lib/api-contract";

export const runtime = "nodejs";

/**
 * POST /api/auth/revoke
 *
 * Deletes the matching `Session` row so the bearer token stops working
 * immediately. Idempotent: revoking an unknown token still returns 200 with
 * `revoked: false` rather than 404 — the CLI's logout UX would otherwise
 * report misleading errors when a token has already been invalidated.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = revokeRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", reason: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await withQueryTimeout(
    prisma.session.deleteMany({
      where: { sessionToken: parsed.data.token },
    }),
  );

  const body = revokeResponseSchema.parse({ revoked: result.count > 0 });
  return NextResponse.json(body);
}
