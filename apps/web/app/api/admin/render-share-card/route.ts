// Admin trigger: enqueue a one-shot `share_card_render` job.

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getProducerQueue } from "@researchcrafters/worker/admin";
import { SHARE_CARD_RENDER_QUEUE } from "@researchcrafters/worker";

export const runtime = "nodejs";

type Body = {
  shareCardId?: unknown;
};

function adminEmails(): Set<string> {
  const raw = process.env["ADMIN_EMAILS"] ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = adminEmails();
  if (allow.size === 0) return false;
  return allow.has(email.toLowerCase());
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session.userId) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 },
    );
  }
  if (!isAdmin(session.user?.email ?? null)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const shareCardId =
    typeof body.shareCardId === "string" && body.shareCardId.length > 0
      ? body.shareCardId
      : null;
  if (!shareCardId) {
    return NextResponse.json(
      { error: "invalid_body", required: ["shareCardId"] },
      { status: 400 },
    );
  }

  const queue = await getProducerQueue(SHARE_CARD_RENDER_QUEUE);
  const job = await queue.add(SHARE_CARD_RENDER_QUEUE, { shareCardId });

  return NextResponse.json({ enqueued: true, jobId: job.id ?? null });
}
