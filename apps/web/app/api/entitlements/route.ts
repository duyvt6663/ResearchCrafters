import { NextResponse } from "next/server";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { getSessionFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Live entitlements endpoint.
 *
 * Returns the caller's current `Membership` (the active one, if any) and
 * every `Entitlement` row tied to their account. Used by the CLI / web to
 * decide which package versions, stages, and mentor features are available.
 *
 * Auth: Bearer token (CLI) or NextAuth cookie. Anonymous callers get 401.
 *
 * Wire shape (kept narrow on purpose — anything more is leakage of internal
 * billing references that the user already has implicitly):
 *
 *   {
 *     membership: { plan: string, status: string } | null,
 *     entitlements: Array<{
 *       scope: string,
 *       packageVersionId: string | null,
 *       stageId: string | null,
 *       source: string,
 *       expiresAt: string | null,
 *     }>
 *   }
 *
 * Replaces the previous stub that filtered on the legacy magic id `"u-paid"`
 * and always returned `[]` for real seed users (qa/api-qa-report.md §2.HIGH).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session.userId) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 },
    );
  }

  try {
    const [membership, entitlements] = await Promise.all([
      withQueryTimeout(
        prisma.membership.findFirst({
          where: { userId: session.userId, status: "active" },
          select: { plan: true, status: true },
          orderBy: { updatedAt: "desc" },
        }),
      ),
      withQueryTimeout(
        prisma.entitlement.findMany({
          where: { userId: session.userId },
          select: {
            scope: true,
            packageVersionId: true,
            stageId: true,
            source: true,
            expiresAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      ),
    ]);

    return NextResponse.json({
      membership: membership
        ? { plan: membership.plan, status: membership.status }
        : null,
      entitlements: entitlements.map((e) => ({
        scope: e.scope,
        packageVersionId: e.packageVersionId,
        stageId: e.stageId,
        source: e.source,
        expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
      })),
    });
  } catch {
    // DB unreachable / schema not migrated: return an empty payload so the
    // CLI degrades to "free tier" behaviour rather than 500-ing.
    return NextResponse.json({ membership: null, entitlements: [] });
  }
}
