// GET /api/account/export
//
// Returns every row tied to the authenticated user as a single
// JSON-serializable payload (the `AccountExport` shape from
// `lib/account-cascade.ts`). The response is served as a file attachment so
// browsers offer "save as" rather than rendering JSON inline.
//
// Telemetry note
// --------------
// We want an `account_data_exported` telemetry event, but the local
// `apps/web/lib/telemetry.ts` `TelemetryEvent` union is a fixed string union
// that does not include this name, and the typed
// `@researchcrafters/telemetry` events package is outside the allowed write
// paths for this change. Rather than misuse an unrelated event name, we emit
// a structured stdout log here in the same shape the local stub uses; once
// the privacy event is added to one of the two telemetry surfaces, the
// fallback should be replaced with a typed `track(...)` call.

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { exportAccount } from "@/lib/account-cascade";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session.userId) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 },
    );
  }

  const exportPayload = await exportAccount({ userId: session.userId });

  // Privacy-event telemetry fallback. See the file header for the contract
  // decision behind this structured log instead of a typed `track()` call.
   
  console.log(
    JSON.stringify({
      kind: "telemetry",
      event: "account_data_exported",
      payload: {
        userId: session.userId,
        rowCounts: {
          memberships: exportPayload.memberships.length,
          entitlements: exportPayload.entitlements.length,
          enrollments: exportPayload.enrollments.length,
          attempts: exportPayload.attempts.length,
          traversals: exportPayload.traversals.length,
          submissions: exportPayload.submissions.length,
          runs: exportPayload.runs.length,
          grades: exportPayload.grades.length,
          mentorThreads: exportPayload.mentorThreads.length,
          mentorMessages: exportPayload.mentorMessages.length,
          shareCards: exportPayload.shareCards.length,
          events: exportPayload.events.length,
        },
      },
      ts: new Date().toISOString(),
    }),
  );

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition":
        'attachment; filename="researchcrafters-export.json"',
      "Cache-Control": "no-store",
    },
  });
}
