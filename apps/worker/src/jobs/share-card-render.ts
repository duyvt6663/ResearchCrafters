import { randomBytes } from 'node:crypto';
import { track } from '@researchcrafters/telemetry';

export interface ShareCardRenderJob {
  shareCardId: string;
}

export interface ShareCardRenderResult {
  shareCardId: string;
  publicSlug: string;
  /** True when the slug was newly generated, false on idempotent re-run. */
  generated: boolean;
}

interface ShareCardRow {
  id: string;
  userId: string;
  enrollmentId: string;
  packageVersionId: string;
  publicSlug: string | null;
}

export interface ShareCardPrisma {
  shareCard: {
    findUnique(args: { where: { id: string } }): Promise<ShareCardRow | null>;
    update(args: {
      where: { id: string };
      data: { publicSlug: string };
    }): Promise<ShareCardRow>;
  };
}

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'; // RFC4648 base32 minus 0/1
const SLUG_LENGTH = 12;

export interface SlugRng {
  randomBytes(n: number): Uint8Array;
}

const defaultRng: SlugRng = {
  randomBytes(n) {
    return new Uint8Array(randomBytes(n));
  },
};

export function generatePublicSlug(rng: SlugRng = defaultRng): string {
  const bytes = rng.randomBytes(SLUG_LENGTH);
  let out = '';
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    const v = bytes[i] ?? 0;
    out += SLUG_ALPHABET[v % SLUG_ALPHABET.length] ?? 'a';
  }
  return out;
}

/**
 * Render the share card. The visual asset (SVG → PNG) is intentionally
 * stubbed. Real impl will render via `@vercel/og` or `sharp`.
 *
 * TODO(share-card-render): emit PNG/SVG to object storage and persist the
 * resulting `imageUrl` on the row.
 */
export async function runShareCardRender(
  job: ShareCardRenderJob,
  prisma: ShareCardPrisma,
  opts: { rng?: SlugRng } = {},
): Promise<ShareCardRenderResult> {
  const card = await prisma.shareCard.findUnique({
    where: { id: job.shareCardId },
  });
  if (!card) {
    throw new Error(`ShareCard not found: ${job.shareCardId}`);
  }

  if (card.publicSlug) {
    return {
      shareCardId: card.id,
      publicSlug: card.publicSlug,
      generated: false,
    };
  }

  const publicSlug = generatePublicSlug(opts.rng ?? defaultRng);
  const updated = await prisma.shareCard.update({
    where: { id: card.id },
    data: { publicSlug },
  });

  await track(
    {
      name: 'share_card_created',
      shareCardId: updated.id,
      enrollmentId: updated.enrollmentId,
      packageVersionId: updated.packageVersionId,
      publicSlug,
    },
    {
      userId: updated.userId,
      packageVersionId: updated.packageVersionId,
    },
  );

  return { shareCardId: updated.id, publicSlug, generated: true };
}
