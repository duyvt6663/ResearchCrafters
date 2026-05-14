// Account-deletion cascade plan and data-export helpers.
//
// Privacy contract
// ----------------
// `ACCOUNT_DELETE_PLAN` is the single source of truth for what happens to each
// PII-bearing table when a user invokes the right-to-erasure flow. The plan is
// the document the privacy team reviews; the runtime in `deleteAccount`
// executes it. If you change a strategy, update the plan AND document why in
// the row's `rationale` so future audits can trace the decision.
//
// Three strategies:
//
//   - 'delete'    — row is purged. Used for direct ownership chains (Account,
//                   Session, Membership, Enrollment, ...).
//   - 'anonymize' — row stays but PII fields are nulled or replaced with a
//                   stable `anonymized-${userId}` sentinel. Used for the User
//                   row itself, which we keep so other tables' historical FKs
//                   to it remain valid.
//   - 'retain'    — row stays as-is (or with userId nulled where the FK
//                   permits). Used for audit-grade Events whose retention is
//                   tracked in backlog/06 §Events Storage and for Reviews where
//                   reviewer prose is part of package moderation history.
//
// Retention numbers (audit-grade events: indefinite; non-audit-grade: scrubbed
// to anonymized aggregates after 24 months) are pulled from
// backlog/06-data-access-analytics.md §Events Storage.

import {
  prisma as defaultPrisma,
  withQueryTimeout,
  type PrismaClient,
} from "@researchcrafters/db";

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * One row in the account-deletion plan. Each row maps a Prisma model name to
 * the strategy applied during account deletion. Optional `retentionDays`
 * documents how long retained rows live (relevant for `retain` rows whose
 * eventual scrubbing is owned by a separate retention job).
 */
export interface AccountDeletePlanRow {
  /** Prisma model name (matches `prisma.<model>` accessor). */
  table: string;
  strategy: "delete" | "anonymize" | "retain";
  /** Retention horizon in days for retained rows. `null` means indefinite. */
  retentionDays?: number | null;
  /** Why this strategy was chosen — load-bearing for audits. */
  rationale: string;
}

/**
 * The privacy contract. Order matters: rows are processed top-to-bottom so
 * dependent rows are deleted before their parents (Run before Submission,
 * Submission before StageAttempt, StageAttempt before Enrollment, ...). The
 * `User` row is processed last because anonymization must outlive the
 * children that reference it.
 */
export const ACCOUNT_DELETE_PLAN: ReadonlyArray<AccountDeletePlanRow> = [
  // --- ephemeral auth rows (delete first; they may block User cascade) ---
  {
    table: "Session",
    strategy: "delete",
    rationale:
      "Auth secret. Sessions cascade via FK on User delete, but we delete eagerly so any in-flight CLI bearer token stops working before the rest of the plan runs.",
  },
  {
    table: "Account",
    strategy: "delete",
    rationale:
      "OAuth provider linkage. providerAccountId is identifying; refresh/access/id_token are auth secrets. Cascades via FK; we delete eagerly to invalidate provider tokens up-front.",
  },
  {
    table: "DeviceCodeFlow",
    strategy: "delete",
    rationale:
      "Short-lived CLI device-code state. Stored userId is nullable (SetNull) so cascade alone leaves stale rows; we explicitly delete flows owned by this user.",
  },
  {
    table: "VerificationToken",
    strategy: "delete",
    rationale:
      "Magic-link secrets keyed by email. No FK on the table, so we match by current user.email (and any historical aliases passed in) and purge.",
  },
  // --- runner / grading chain (must clear before StageAttempt) ---
  {
    table: "Run",
    strategy: "delete",
    rationale:
      "User-authored artifact pointer (S3 log key). Underlying S3 object is purged out-of-band per backlog/08 lifecycle policy.",
  },
  {
    table: "Grade",
    strategy: "delete",
    retentionDays: null,
    rationale:
      "Grade is an audit artifact, but right-to-erasure outranks audit retention for the deleted user's own grades. Audit-grade telemetry (grade_created events) is retained separately under Event.retain.",
  },
  {
    table: "Submission",
    strategy: "delete",
    rationale:
      "User-authored code bundle. Submission FK to StageAttempt is Restrict, so we delete explicitly here before the StageAttempt row is removed.",
  },
  {
    table: "StageAttempt",
    strategy: "delete",
    rationale:
      "Carries free-text answer JSON. Cascades through Enrollment but we delete explicitly so the order with Submission/Run is deterministic.",
  },
  // --- mentor chain ---
  {
    table: "MentorMessage",
    strategy: "delete",
    rationale:
      "Free-text mentor transcripts. Cascades through MentorThread; explicit delete keeps the order deterministic.",
  },
  {
    table: "MentorThread",
    strategy: "delete",
    rationale:
      "Quasi-PII (which user asked for help on which stage). Cascades through Enrollment.",
  },
  // --- progress / sharing chain ---
  {
    table: "NodeTraversal",
    strategy: "delete",
    rationale:
      "Quasi-PII branch-selection sequence. Cascades through Enrollment.",
  },
  {
    table: "ShareCard",
    strategy: "delete",
    rationale:
      "Free-text learner insight + public slug. Deleting the row 404s the public URL the learner may have shared externally.",
  },
  {
    table: "Enrollment",
    strategy: "delete",
    rationale:
      "Owns the learner's progress graph for one PackageVersion. Cascades from User; explicit delete keeps the order with NodeTraversal/StageAttempt/MentorThread/ShareCard deterministic.",
  },
  // --- billing / entitlement ---
  {
    table: "Entitlement",
    strategy: "delete",
    rationale: "Linked to userId; cascades on User delete.",
  },
  {
    table: "Membership",
    strategy: "delete",
    rationale:
      "Carries opaque billing-provider id (Stripe customer/subscription). Upstream billing record must be canceled out-of-band — this only removes the local mirror.",
  },
  // --- retained / partially retained chains ---
  {
    table: "Review",
    strategy: "retain",
    retentionDays: null,
    rationale:
      "Reviewer prose is part of package moderation history. reviewerId already has SetNull so cascade nulls the FK; the row itself stays. No additional action needed.",
  },
  {
    table: "Event",
    strategy: "retain",
    retentionDays: null,
    rationale:
      "Audit-grade events (grade_created, grade_overridden, evaluator_redaction_triggered, subscription_started, branch_feedback_unlocked) are retained indefinitely per backlog/06 §Events Storage. userId already has SetNull so it is nulled on User delete; non-audit rows are scrubbed by the retention job after 24 months.",
  },
  // --- finally, the user row itself ---
  {
    table: "User",
    strategy: "anonymize",
    rationale:
      "We do not delete the User row outright because retained Event/Review rows still reference it via SetNull-able FKs. PII columns (email, name, displayName, githubHandle, image, emailVerified) are anonymized so the row no longer maps to a real person.",
  },
] as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Test seam — let unit tests inject a Prisma-like surface without booting the
 * generated client.
 */
export interface AccountCascadePrisma {
  $transaction: PrismaClient["$transaction"];
  user: PrismaClient["user"];
  session: PrismaClient["session"];
  account: PrismaClient["account"];
  deviceCodeFlow: PrismaClient["deviceCodeFlow"];
  verificationToken: PrismaClient["verificationToken"];
  membership: PrismaClient["membership"];
  entitlement: PrismaClient["entitlement"];
  enrollment: PrismaClient["enrollment"];
  stageAttempt: PrismaClient["stageAttempt"];
  submission: PrismaClient["submission"];
  run: PrismaClient["run"];
  grade: PrismaClient["grade"];
  mentorThread: PrismaClient["mentorThread"];
  mentorMessage: PrismaClient["mentorMessage"];
  shareCard: PrismaClient["shareCard"];
  nodeTraversal: PrismaClient["nodeTraversal"];
  review: PrismaClient["review"];
  event: PrismaClient["event"];
}

export interface DeleteAccountInput {
  userId: string;
  reason?: string;
  /** Optional override for tests / scripts. */
  prisma?: AccountCascadePrisma;
}

export interface DeleteAccountResult {
  userId: string;
  /** Per-table row-counts removed or anonymized. */
  counts: Record<string, number>;
  /** Free-form reason captured by the caller (optional). */
  reason: string | null;
  /** ISO timestamp the deletion completed. */
  completedAt: string;
}

/**
 * Sentinel email written into the User row during anonymization. A `.invalid`
 * TLD is reserved by RFC 6761 and will never deliver mail, so we use it
 * deliberately for tombstone email values.
 */
export function anonymizedEmailFor(userId: string): string {
  return `anonymized-${userId}@deleted.invalid`;
}

/**
 * Execute {@link ACCOUNT_DELETE_PLAN} for one user inside a transaction.
 * Throws if any step fails so the whole deletion rolls back.
 */
export async function deleteAccount(
  input: DeleteAccountInput,
): Promise<DeleteAccountResult> {
  const client = input.prisma ?? (defaultPrisma as unknown as AccountCascadePrisma);
  const { userId } = input;
  const reason = input.reason ?? null;

  // We intentionally do not nest this in `withQueryTimeout` — the deletion
  // chain can legitimately take longer than the default 10s on heavy users.
  // Prisma's own transaction timeout (default 5s) is overridden below.
  const counts = await client.$transaction(
    async (tx) => {
      const out: Record<string, number> = {};

      // Resolve the user up-front so we know which email aliases to scrub
      // from VerificationToken (which has no FK).
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      });
      if (!user) {
        throw new Error(`account-cascade: user ${userId} not found`);
      }

      // ---- Sessions / Accounts / DeviceCodeFlow / VerificationToken ----
      out["Session"] = (
        await tx.session.deleteMany({ where: { userId } })
      ).count;

      out["Account"] = (
        await tx.account.deleteMany({ where: { userId } })
      ).count;

      out["DeviceCodeFlow"] = (
        await tx.deviceCodeFlow.deleteMany({ where: { userId } })
      ).count;

      out["VerificationToken"] = (
        await tx.verificationToken.deleteMany({
          where: { identifier: user.email },
        })
      ).count;

      // ---- Runner / grading chain ----
      // Find every enrollment for this user so we can scope the runner-chain
      // deletes precisely (avoids the giant cross-user IN list).
      const enrollments = await tx.enrollment.findMany({
        where: { userId },
        select: { id: true },
      });
      const enrollmentIds = enrollments.map((e) => e.id);

      const stageAttempts =
        enrollmentIds.length === 0
          ? []
          : await tx.stageAttempt.findMany({
              where: { enrollmentId: { in: enrollmentIds } },
              select: { id: true },
            });
      const stageAttemptIds = stageAttempts.map((s) => s.id);

      const submissions =
        stageAttemptIds.length === 0
          ? []
          : await tx.submission.findMany({
              where: { stageAttemptId: { in: stageAttemptIds } },
              select: { id: true },
            });
      const submissionIds = submissions.map((s) => s.id);

      out["Run"] =
        submissionIds.length === 0
          ? 0
          : (
              await tx.run.deleteMany({
                where: { submissionId: { in: submissionIds } },
              })
            ).count;

      out["Grade"] =
        stageAttemptIds.length === 0
          ? 0
          : (
              await tx.grade.deleteMany({
                where: { stageAttemptId: { in: stageAttemptIds } },
              })
            ).count;

      out["Submission"] =
        stageAttemptIds.length === 0
          ? 0
          : (
              await tx.submission.deleteMany({
                where: { stageAttemptId: { in: stageAttemptIds } },
              })
            ).count;

      out["StageAttempt"] =
        enrollmentIds.length === 0
          ? 0
          : (
              await tx.stageAttempt.deleteMany({
                where: { enrollmentId: { in: enrollmentIds } },
              })
            ).count;

      // ---- Mentor chain ----
      const threads =
        enrollmentIds.length === 0
          ? []
          : await tx.mentorThread.findMany({
              where: { enrollmentId: { in: enrollmentIds } },
              select: { id: true },
            });
      const threadIds = threads.map((t) => t.id);

      out["MentorMessage"] =
        threadIds.length === 0
          ? 0
          : (
              await tx.mentorMessage.deleteMany({
                where: { threadId: { in: threadIds } },
              })
            ).count;

      out["MentorThread"] =
        enrollmentIds.length === 0
          ? 0
          : (
              await tx.mentorThread.deleteMany({
                where: { enrollmentId: { in: enrollmentIds } },
              })
            ).count;

      // ---- Progress / sharing chain ----
      out["NodeTraversal"] =
        enrollmentIds.length === 0
          ? 0
          : (
              await tx.nodeTraversal.deleteMany({
                where: { enrollmentId: { in: enrollmentIds } },
              })
            ).count;

      out["ShareCard"] = (
        await tx.shareCard.deleteMany({ where: { userId } })
      ).count;

      out["Enrollment"] = (
        await tx.enrollment.deleteMany({ where: { userId } })
      ).count;

      // ---- Billing / entitlement ----
      out["Entitlement"] = (
        await tx.entitlement.deleteMany({ where: { userId } })
      ).count;

      out["Membership"] = (
        await tx.membership.deleteMany({ where: { userId } })
      ).count;

      // ---- Retained rows (Review, Event) ----
      // Both have SetNull on the userId FK at the schema level. We don't
      // need to touch them: Postgres applies SetNull when the User row is
      // deleted. But we anonymize the User row instead of deleting it (so
      // historical FKs remain valid) — explicitly null the userId here so
      // the audit trail shows "an unknown user" rather than the now-tombstoned
      // user id.
      const eventScrub = await tx.event.updateMany({
        where: { userId },
        data: { userId: null },
      });
      out["Event"] = eventScrub.count;

      const reviewScrub = await tx.review.updateMany({
        where: { reviewerId: userId },
        data: { reviewerId: null },
      });
      out["Review"] = reviewScrub.count;

      // ---- Anonymize the User row ----
      await tx.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmailFor(userId),
          githubHandle: null,
          displayName: null,
          name: null,
          image: null,
          emailVerified: null,
        },
      });
      out["User"] = 1;

      return out;
    },
    { timeout: 30_000, maxWait: 5_000 },
  );

  return {
    userId,
    counts,
    reason,
    completedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * The shape returned by {@link exportAccount} and served by
 * `GET /api/account/export`. This is the public contract for the user
 * data-export feature — adding fields is safe; removing or renaming is a
 * breaking change for users who diff their exports across releases.
 *
 * The shape is intentionally JSON-serializable: every Date is converted to an
 * ISO string and Prisma `Json` columns are passed through as-is. There are no
 * Prisma engine internals (relations, lazy loaders, ...) in the output.
 */
export interface AccountExport {
  /** Schema version of the export shape. Bump on breaking changes. */
  exportVersion: 1;
  /** ISO timestamp the export was assembled. */
  generatedAt: string;
  user: ExportedUser | null;
  memberships: ExportedRow[];
  entitlements: ExportedRow[];
  enrollments: ExportedRow[];
  attempts: ExportedRow[];
  traversals: ExportedRow[];
  submissions: ExportedRow[];
  runs: ExportedRow[];
  grades: ExportedRow[];
  mentorThreads: ExportedRow[];
  mentorMessages: ExportedRow[];
  shareCards: ExportedRow[];
  events: ExportedRow[];
}

export interface ExportedUser {
  id: string;
  email: string | null;
  githubHandle: string | null;
  displayName: string | null;
  name: string | null;
  image: string | null;
  emailVerified: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Generic row shape after Date → ISO normalization. */
export type ExportedRow = Record<string, unknown>;

export interface ExportAccountInput {
  userId: string;
  /** Optional override for tests / scripts. */
  prisma?: AccountCascadePrisma;
}

/**
 * Assemble a single JSON-serializable object containing every row the user
 * owns or co-owns. Read-only — never writes.
 */
export async function exportAccount(
  input: ExportAccountInput,
): Promise<AccountExport> {
  const client = input.prisma ?? (defaultPrisma as unknown as AccountCascadePrisma);
  const { userId } = input;

  // Pull the user row first; if missing we still return a well-formed
  // envelope so callers can distinguish "no rows" from "user not found"
  // (user === null in the latter).
  const user = await withQueryTimeout(
    client.user.findUnique({ where: { id: userId } }),
  );

  const [
    memberships,
    entitlements,
    enrollments,
    shareCards,
    events,
  ] = await Promise.all([
    client.membership.findMany({ where: { userId } }),
    client.entitlement.findMany({ where: { userId } }),
    client.enrollment.findMany({ where: { userId } }),
    client.shareCard.findMany({ where: { userId } }),
    client.event.findMany({ where: { userId } }),
  ]);

  const enrollmentIds = enrollments.map((e: { id: string }) => e.id);
  const [
    attempts,
    traversals,
    mentorThreads,
  ] = await Promise.all([
    enrollmentIds.length === 0
      ? Promise.resolve([])
      : client.stageAttempt.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
        }),
    enrollmentIds.length === 0
      ? Promise.resolve([])
      : client.nodeTraversal.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
        }),
    enrollmentIds.length === 0
      ? Promise.resolve([])
      : client.mentorThread.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
        }),
  ]);

  const attemptIds = (attempts as Array<{ id: string }>).map((a) => a.id);
  const threadIds = (mentorThreads as Array<{ id: string }>).map((t) => t.id);

  const [submissions, mentorMessages] = await Promise.all([
    attemptIds.length === 0
      ? Promise.resolve([])
      : client.submission.findMany({
          where: { stageAttemptId: { in: attemptIds } },
        }),
    threadIds.length === 0
      ? Promise.resolve([])
      : client.mentorMessage.findMany({
          where: { threadId: { in: threadIds } },
        }),
  ]);

  const submissionIds = (submissions as Array<{ id: string }>).map((s) => s.id);
  const [runs, grades] = await Promise.all([
    submissionIds.length === 0
      ? Promise.resolve([])
      : client.run.findMany({
          where: { submissionId: { in: submissionIds } },
        }),
    attemptIds.length === 0
      ? Promise.resolve([])
      : client.grade.findMany({
          where: { stageAttemptId: { in: attemptIds } },
        }),
  ]);

  return {
    exportVersion: 1,
    generatedAt: new Date().toISOString(),
    user: user
      ? {
          id: user.id,
          email: user.email ?? null,
          githubHandle: user.githubHandle ?? null,
          displayName: user.displayName ?? null,
          name: user.name ?? null,
          image: user.image ?? null,
          emailVerified: user.emailVerified
            ? user.emailVerified.toISOString()
            : null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        }
      : null,
    memberships: (memberships as ExportedRow[]).map(normalizeRow),
    entitlements: (entitlements as ExportedRow[]).map(normalizeRow),
    enrollments: (enrollments as ExportedRow[]).map(normalizeRow),
    attempts: (attempts as ExportedRow[]).map(normalizeRow),
    traversals: (traversals as ExportedRow[]).map(normalizeRow),
    submissions: (submissions as ExportedRow[]).map(normalizeRow),
    runs: (runs as ExportedRow[]).map(normalizeRow),
    grades: (grades as ExportedRow[]).map(normalizeRow),
    mentorThreads: (mentorThreads as ExportedRow[]).map(normalizeRow),
    mentorMessages: (mentorMessages as ExportedRow[]).map(normalizeRow),
    shareCards: (shareCards as ExportedRow[]).map(normalizeRow),
    events: (events as ExportedRow[]).map(normalizeRow),
  };
}

/**
 * Convert any Date values to ISO strings so the row is JSON-serializable.
 * Prisma `Json` columns are already plain JSON values; we leave them alone.
 * BigInt is converted to string for the same reason.
 */
function normalizeRow(row: ExportedRow): ExportedRow {
  const out: ExportedRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (typeof value === "bigint") {
      out[key] = value.toString();
    } else {
      out[key] = value;
    }
  }
  return out;
}
