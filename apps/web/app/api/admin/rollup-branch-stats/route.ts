// Admin trigger: enqueue a one-shot `branch_stats_rollup` job.
//
// Gating is intentionally inline (env-configured `ADMIN_EMAILS` allowlist)
// rather than going through `permissions.canAccess` — the policy module is
// scoped to learner/stage actions, not platform admin endpoints.

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getProducerQueue } from "@researchcrafters/worker/admin";
import { BRANCH_STATS_ROLLUP_QUEUE } from "@researchcrafters/worker";
import { COHORTS, isCohort } from "@researchcrafters/telemetry";

export const runtime = "nodejs";

type Body = {
  packageVersionId?: unknown;
  cohort?: unknown;
  windowStart?: unknown;
  windowEnd?: unknown;
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

  const packageVersionId =
    typeof body.packageVersionId === "string" ? body.packageVersionId : null;
  const cohort = typeof body.cohort === "string" ? body.cohort : null;
  const windowStart =
    typeof body.windowStart === "string" ? body.windowStart : null;
  const windowEnd =
    typeof body.windowEnd === "string" ? body.windowEnd : null;

  if (!packageVersionId || !cohort || !windowStart || !windowEnd) {
    return NextResponse.json(
      {
        error: "invalid_body",
        required: ["packageVersionId", "cohort", "windowStart", "windowEnd"],
      },
      { status: 400 },
    );
  }
  if (!isCohort(cohort)) {
    return NextResponse.json(
      { error: "invalid_cohort", validCohorts: [...COHORTS] },
      { status: 400 },
    );
  }
  if (Number.isNaN(Date.parse(windowStart)) || Number.isNaN(Date.parse(windowEnd))) {
    return NextResponse.json(
      { error: "invalid_window" },
      { status: 400 },
    );
  }

  const queue = await getProducerQueue(BRANCH_STATS_ROLLUP_QUEUE);
  const job = await queue.add(BRANCH_STATS_ROLLUP_QUEUE, {
    packageVersionId,
    cohort,
    windowStart,
    windowEnd,
  });

  return NextResponse.json({ enqueued: true, jobId: job.id ?? null });
}
