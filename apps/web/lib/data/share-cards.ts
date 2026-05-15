// Share-card persistence wrapper. Routes import these helpers instead of
// hitting Prisma directly so tests can mock this module without standing up
// a database.

import type { Prisma } from "@researchcrafters/db";
import { prisma, withQueryTimeout } from "@researchcrafters/db";

export type ShareCardRecord = {
  id: string;
  userId: string;
  enrollmentId: string;
  packageVersionId: string;
  payload: unknown;
  publicSlug: string | null;
  createdAt: Date;
};

export type CreateShareCardInput = {
  userId: string;
  enrollmentId: string;
  packageVersionId: string;
  payload: Prisma.InputJsonValue;
  publicSlug: string;
};

export async function createShareCard(
  input: CreateShareCardInput,
): Promise<ShareCardRecord> {
  return withQueryTimeout(
    prisma.shareCard.create({
      data: {
        userId: input.userId,
        enrollmentId: input.enrollmentId,
        packageVersionId: input.packageVersionId,
        payload: input.payload,
        publicSlug: input.publicSlug,
      },
    }),
  ) as Promise<ShareCardRecord>;
}

export async function getShareCardById(
  id: string,
): Promise<ShareCardRecord | null> {
  return withQueryTimeout(
    prisma.shareCard.findUnique({ where: { id } }),
  ) as Promise<ShareCardRecord | null>;
}

/**
 * Resolve a share card by its public slug. Returns `null` when no row
 * carries the slug, which covers both "never published" and "unshared"
 * (revoke clears `publicSlug` to `null`, so a stale slug stops resolving
 * immediately after revoke).
 */
export async function getShareCardByPublicSlug(
  publicSlug: string,
): Promise<ShareCardRecord | null> {
  return withQueryTimeout(
    prisma.shareCard.findUnique({ where: { publicSlug } }),
  ) as Promise<ShareCardRecord | null>;
}

/**
 * Revoke a share card's public slug. Returns the updated row, or `null` if
 * the row doesn't exist or already has no slug (idempotent unshare).
 */
export async function revokeShareCardPublicSlug(
  id: string,
): Promise<ShareCardRecord | null> {
  const existing = await withQueryTimeout(
    prisma.shareCard.findUnique({
      where: { id },
      select: { id: true, publicSlug: true },
    }),
  );
  if (!existing) return null;
  if (existing.publicSlug == null) {
    return withQueryTimeout(
      prisma.shareCard.findUnique({ where: { id } }),
    ) as Promise<ShareCardRecord | null>;
  }
  return withQueryTimeout(
    prisma.shareCard.update({
      where: { id },
      data: { publicSlug: null },
    }),
  ) as Promise<ShareCardRecord>;
}
