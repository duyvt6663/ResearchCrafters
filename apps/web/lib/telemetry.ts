import {
  track as workspaceTrack,
  type TelemetryEvent as WorkspaceTelemetryEvent,
  type TrackContext,
} from "@researchcrafters/telemetry";

export type TelemetryEvent =
  | "package_viewed"
  | "enrollment_started"
  | "stage_loaded"
  | "stage_attempt_submitted"
  | "branch_selected"
  | "branch_feedback_unlocked"
  | "branch_feedback_viewed"
  | "runner_job_started"
  | "runner_job_completed"
  | "grade_created"
  | "grade_overridden"
  | "evaluator_redaction_triggered"
  | "mentor_hint_requested"
  | "mentor_feedback_requested"
  | "mentor_output_flagged_for_review"
  | "stage_completed"
  | "share_card_created"
  | "share_card_unshared"
  | "paywall_viewed"
  | "subscription_started"
  | "submission_bundle_purged"
  | "submission_deleted"
  | "waitlist_intent";

export type TelemetryPayload = Record<string, string | number | boolean | null>;

const CONTEXT_KEYS = ["userId", "packageVersionId", "stageRef"] as const;

function extractContext(payload: TelemetryPayload): TrackContext {
  const ctx: TrackContext = {};
  for (const key of CONTEXT_KEYS) {
    const value = payload[key];
    if (typeof value === "string") {
      ctx[key] = value;
    }
  }
  return ctx;
}

/**
 * Server-side telemetry entrypoint. Best-effort dual-write:
 *   - PostHog product analytics when `POSTHOG_API_KEY` is set.
 *   - Postgres `Event` row for audit-grade event names.
 * Falls back to a structured stderr log when neither destination accepts
 * the event so dev environments still see what would have been recorded.
 */
export async function track(
  event: TelemetryEvent,
  payload: TelemetryPayload = {},
): Promise<void> {
  const ctx = extractContext(payload);
  const wsEvent = { name: event, ...payload } as unknown as WorkspaceTelemetryEvent;

  try {
    await workspaceTrack(wsEvent, ctx);
  } catch (err) {
    console.warn(
      JSON.stringify({
        kind: "telemetry",
        level: "warn",
        message: "telemetry dispatch failed",
        event,
        err: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    );
  }

  if (!process.env["POSTHOG_API_KEY"]) {
    console.log(
      JSON.stringify({
        kind: "telemetry",
        event,
        payload,
        ts: new Date().toISOString(),
      }),
    );
  }
}
