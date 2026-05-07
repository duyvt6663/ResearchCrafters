// Telemetry stub. Real implementation will dual-write to PostHog and the
// Postgres `events` table per TODOS/06. For now we emit structured logs.

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
  | "stage_completed"
  | "share_card_created"
  | "paywall_viewed"
  | "subscription_started";

export type TelemetryPayload = Record<string, string | number | boolean | null>;

export async function track(
  event: TelemetryEvent,
  payload: TelemetryPayload = {},
): Promise<void> {
  // Server-side stub: structured log, no network call.
  // Replace with PostHog SDK + Postgres audit insert later.
   
  console.log(
    JSON.stringify({
      kind: "telemetry",
      event,
      payload,
      ts: new Date().toISOString(),
    }),
  );
}
