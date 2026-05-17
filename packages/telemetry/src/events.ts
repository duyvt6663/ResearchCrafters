export type { Cohort } from './cohorts.js';

export type BranchType =
  | 'canonical'
  | 'failed'
  | 'suboptimal'
  | 'ambiguous'
  | 'extension';

export type RunnerMode = 'test' | 'replay' | 'mini_experiment' | 'none';

export type RunnerStatus =
  | 'queued'
  | 'running'
  | 'ok'
  | 'timeout'
  | 'oom'
  | 'crash'
  | 'exit_nonzero';

export type PackageViewedSurface = 'catalog' | 'overview' | 'share' | 'embed';

export type MentorRequestKind = 'hint' | 'feedback';

export type SubscriptionPlan = 'free' | 'pro' | 'team' | 'institution';

export interface PackageViewedEvent {
  name: 'package_viewed';
  packageVersionId?: string;
  packageSlug?: string;
  surface: PackageViewedSurface;
  count?: number;
}

export interface EnrollmentStartedEvent {
  name: 'enrollment_started';
  enrollmentId: string;
  packageVersionId: string;
  packageSlug?: string;
}

export interface StageLoadedEvent {
  name: 'stage_loaded';
  enrollmentId: string;
  stageRef: string;
  packageVersionId?: string;
}

export interface StageAttemptSubmittedEvent {
  name: 'stage_attempt_submitted';
  enrollmentId: string;
  stageRef: string;
  attemptId?: string;
  branchId?: string;
}

export interface BranchSelectedEvent {
  name: 'branch_selected';
  enrollmentId: string;
  stageRef: string;
  decisionNodeId: string;
  branchId: string;
  confidence?: number | null;
}

export interface BranchFeedbackUnlockedEvent {
  name: 'branch_feedback_unlocked';
  enrollmentId: string;
  stageRef: string;
  decisionNodeId: string;
  branchId: string;
  branchType?: BranchType;
}

export interface BranchFeedbackViewedEvent {
  name: 'branch_feedback_viewed';
  enrollmentId: string;
  stageRef: string;
  decisionNodeId: string;
  branchId: string;
}

export interface RunnerJobStartedEvent {
  name: 'runner_job_started';
  enrollmentId: string;
  stageRef: string;
  submissionId: string;
  runnerMode: RunnerMode;
}

export interface RunnerJobCompletedEvent {
  name: 'runner_job_completed';
  submissionId: string;
  runId: string;
  status: RunnerStatus;
  durationMs?: number;
}

export interface GradeCreatedEvent {
  name: 'grade_created';
  gradeId: string;
  submissionId: string;
  stageAttemptId?: string;
  rubricVersion: string;
  evaluatorVersion: string;
  passed: boolean;
  score?: number;
}

export interface GradeOverriddenEvent {
  name: 'grade_overridden';
  gradeId: string;
  reviewerId: string;
  previousScore?: number;
  nextScore?: number;
}

export interface EvaluatorRedactionTriggeredEvent {
  name: 'evaluator_redaction_triggered';
  gradeId?: string;
  submissionId?: string;
  matchedTargets: string[];
}

export interface MentorHintRequestedEvent {
  name: 'mentor_hint_requested';
  enrollmentId: string;
  stageRef: string;
  threadId?: string;
}

export interface MentorFeedbackRequestedEvent {
  name: 'mentor_feedback_requested';
  enrollmentId: string;
  stageRef: string;
  threadId?: string;
}

export interface MentorRateLimitedEvent {
  name: 'mentor_rate_limited';
  enrollmentId: string;
  stageRef: string;
  userId: string;
  scope: 'per_user' | 'per_user_package';
  retryAfterSeconds: number;
}

/**
 * Mentor first-token latency, captured per request so dashboards can
 * compute the p95 against the authored SLO. The current `LLMGateway` is
 * non-streaming, so `latencyMs` is measured as the duration of
 * `gateway.complete(...)` (i.e. completion latency). When streaming is
 * added, the same emission point swaps to the first-chunk timestamp
 * without changing the event shape or the SLO targets.
 *
 * SLO thresholds (per `backlog/05-mentor-safety.md` §SLOs):
 *   - hint: p95 < 5000ms
 *   - feedback: p95 < 15000ms
 *
 * `withinSlo` is the per-request boolean so dashboards can also report a
 * cheap "% within SLO" alongside the p95.
 */
export interface MentorFirstTokenLatencyEvent {
  name: 'mentor_first_token_latency';
  enrollmentId: string;
  stageRef: string;
  mode: MentorRequestKind;
  modelTier: string;
  modelId: string;
  latencyMs: number;
  sloMs: number;
  withinSlo: boolean;
}

export interface StageCompletedEvent {
  name: 'stage_completed';
  enrollmentId: string;
  stageRef: string;
  branchId?: string;
  passed: boolean;
}

export interface ShareCardCreatedEvent {
  name: 'share_card_created';
  shareCardId: string;
  enrollmentId: string;
  packageVersionId: string;
  publicSlug?: string;
}

export interface ShareCardUnsharedEvent {
  name: 'share_card_unshared';
  shareCardId: string;
  enrollmentId: string;
  packageVersionId: string;
  previousSlug: string;
}

export interface PaywallViewedEvent {
  name: 'paywall_viewed';
  packageVersionId?: string;
  stageRef?: string;
  reason?: string;
}

export interface SubscriptionStartedEvent {
  name: 'subscription_started';
  membershipId: string;
  plan: SubscriptionPlan;
  billingRef?: string;
}

export type TelemetryEvent =
  | PackageViewedEvent
  | EnrollmentStartedEvent
  | StageLoadedEvent
  | StageAttemptSubmittedEvent
  | BranchSelectedEvent
  | BranchFeedbackUnlockedEvent
  | BranchFeedbackViewedEvent
  | RunnerJobStartedEvent
  | RunnerJobCompletedEvent
  | GradeCreatedEvent
  | GradeOverriddenEvent
  | EvaluatorRedactionTriggeredEvent
  | MentorHintRequestedEvent
  | MentorFeedbackRequestedEvent
  | MentorRateLimitedEvent
  | MentorFirstTokenLatencyEvent
  | StageCompletedEvent
  | ShareCardCreatedEvent
  | ShareCardUnsharedEvent
  | PaywallViewedEvent
  | SubscriptionStartedEvent;

export type TelemetryEventName = TelemetryEvent['name'];

/**
 * Events that affect entitlement, grading, mentor policy, payments, or
 * moderation. Per backlog/06 §Events Storage, these are dual-written: PostHog
 * remains the primary product analytics store and Postgres `Event` rows are
 * persisted indefinitely as the audit-grade copy.
 */
export const AUDIT_GRADE_EVENTS: ReadonlySet<TelemetryEventName> = new Set<
  TelemetryEventName
>([
  'grade_created',
  'grade_overridden',
  'evaluator_redaction_triggered',
  'subscription_started',
  'branch_feedback_unlocked',
]);

export function isAuditGradeEvent(name: TelemetryEventName): boolean {
  return AUDIT_GRADE_EVENTS.has(name);
}
