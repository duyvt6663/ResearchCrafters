/**
 * Mentor runtime — server-side glue between the `/api/mentor/messages` route
 * and the `@researchcrafters/ai` gateway.
 *
 * The route delegates here so the route handler stays thin (validation,
 * session, response shape) and the policy plumbing (visibility, leak tests,
 * redaction, persistence) lives in one testable surface. Tests inject a
 * `gateway` so they never touch the real Anthropic SDK.
 *
 * Key invariants:
 *   - The model NEVER authors refusals. Refusal copy comes from
 *     `cope.mentor.refusal(...)`.
 *   - `runLeakTests` runs against the same gateway BEFORE we return a
 *     response. If it surfaces evidence of a redaction-target leak, the
 *     assistant text is replaced with the authored refusal copy.
 *   - `redact` is the second line of defence: even if leak-tests pass, we
 *     scrub the assistant text against `mentor_redaction_targets` before it
 *     hits the wire.
 *   - Visibility misconfiguration (`always` on canonical_solution /
 *     branch_solutions) is treated as a developer-facing error, not a
 *     learner-facing refusal — we surface it as 500 and recycle the
 *     `evaluator_redaction_triggered` telemetry event.
 *   - Every assistant message persisted to `mentor_messages` carries
 *     `modelTier`, `modelId`, `provider`, `promptTokens`, `completionTokens`,
 *     `redactionTriggered`, `flagged` (per backlog/05).
 */

import {
  AnthropicGateway,
  buildMentorContext,
  buildMentorPrompt,
  MockLLMGateway,
  redact,
  runLeakTests,
} from "@researchcrafters/ai";
import type {
  LLMGateway,
  MentorContext,
  ModelTier,
} from "@researchcrafters/ai";
import type { StagePolicy } from "@researchcrafters/erp-schema";
import { mentorRefusal } from "@researchcrafters/ui/copy";
import {
  prisma as defaultPrisma,
  withQueryTimeout as defaultWithQueryTimeout,
} from "@researchcrafters/db";

// Limited Prisma surface the runtime needs. Tests pass a stub matching this
// shape rather than the full PrismaClient — keeps the mock surface tiny.
export interface MentorRuntimePrisma {
  mentorThread: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
  mentorMessage: {
    create: (args: unknown) => Promise<{ id: string }>;
  };
}

export type MentorMode = "hint" | "clarify" | "review_draft" | "explain_branch";

export interface MentorRuntimeStage {
  /** YAML stage id (`Stage.stageId`). */
  ref: string;
  /** Mirrored stage policy JSON from `Stage.stagePolicy`. */
  stagePolicy: unknown;
  /** Optional artifact refs available to the mentor for this stage. */
  artifactRefs?: ReadonlyArray<string>;
}

export interface MentorRuntimeEnrollment {
  id: string;
  packageVersionId: string;
}

export interface MentorRuntimeVisibility {
  hasAttempt: boolean;
  hasPassed: boolean;
  hasCompletedPackage: boolean;
}

export interface MentorRuntimeInput {
  enrollment: MentorRuntimeEnrollment;
  stage: MentorRuntimeStage;
  mode: MentorMode;
  message: string;
  visibility?: MentorRuntimeVisibility;
  /** Override the gateway. Tests inject a `MockLLMGateway`. */
  gateway?: LLMGateway;
  /** Override the persistence client. Tests pass a stub. */
  prisma?: MentorRuntimePrisma;
  /** Override the timeout wrapper. Tests pass an identity wrapper. */
  withQueryTimeout?: <T>(p: PromiseLike<T>) => Promise<T>;
  /**
   * Telemetry sink. Defaults to a no-op so the runtime stays pure when called
   * outside the route handler (tests, scripts). The route passes the live
   * `track()` function.
   */
  track?: (event: TelemetryEventName, payload: TelemetryPayload) => Promise<void>;
}

export type TelemetryEventName =
  | "mentor_hint_requested"
  | "mentor_feedback_requested"
  | "evaluator_redaction_triggered"
  | "mentor_output_flagged_for_review";
export type TelemetryPayload = Record<string, string | number | boolean | null>;

export type MentorRuntimeOutcome =
  | {
      kind: "ok";
      threadId: string;
      messageId: string;
      assistantText: string;
      redactionTriggered: boolean;
      flagged: boolean;
      /**
       * Reason the assistant message was flagged for review, or `null` when
       * it was not flagged. One of:
       *   - "policy_violation" — leak-test attack surfaced a redaction target.
       *   - "low_confidence:empty" — provider returned empty/very short text.
       *   - "low_confidence:truncated" — provider stopped on max-tokens.
       *   - "low_confidence:uncertainty" — output matches an uncertainty
       *     marker (e.g. "I don't know", "I'm not sure", "I cannot determine").
       * Surfaces the rationale to the review queue so reviewers can triage by
       * cause. The persisted `MentorMessage.flagged` boolean index lets the
       * future review queue query open items; `mentor_output_flagged_for_review`
       * telemetry carries the same reason for the audit-grade event log.
       */
      flagReason: string | null;
      modelTier: ModelTier;
      modelId: string;
      provider: string;
      promptTokens: number;
      completionTokens: number;
    }
  | {
      kind: "policy_misconfig";
      reason: string;
    };

/**
 * Low-confidence detection thresholds and uncertainty markers. Tuned to be
 * conservative — false positives only increase the review queue volume; they
 * do not refuse the learner. Reviewers can re-tune by walking the queue.
 *
 * Markers are matched case-insensitively as substrings on the post-redaction
 * assistant text. Keep this list short and explicit; broad regex matches
 * would catch legitimate hedged answers ("you might consider...").
 */
const LOW_CONFIDENCE_MIN_CHARS = 16;
const LOW_CONFIDENCE_UNCERTAINTY_MARKERS: ReadonlyArray<string> = [
  "i don't know",
  "i do not know",
  "i'm not sure",
  "i am not sure",
  "i cannot determine",
  "i can't determine",
  "i'm unable to answer",
  "i am unable to answer",
  "i don't have enough information",
  "i do not have enough information",
];
const LOW_CONFIDENCE_TRUNCATED_FINISH_REASONS: ReadonlyArray<string> = [
  "max_tokens",
  "length",
];

/**
 * Inspect the assistant response for low-confidence signals worth flagging
 * for review. Returns `null` when the response looks healthy, otherwise a
 * `"low_confidence:<sub>"` reason tag matching `MentorRuntimeOutcome.flagReason`.
 *
 * Heuristic only — the gateway does not expose calibrated confidence scores
 * today. The reviewer queue ("Review Queue" section in
 * `backlog/05-mentor-safety.md`) is the human-in-the-loop on top of this
 * detector; tune thresholds from queue triage feedback.
 */
export function detectLowConfidence(
  text: string,
  finishReason: string | undefined,
): string | null {
  const trimmed = text.trim();
  if (trimmed.length < LOW_CONFIDENCE_MIN_CHARS) {
    return "low_confidence:empty";
  }
  if (
    finishReason !== undefined &&
    LOW_CONFIDENCE_TRUNCATED_FINISH_REASONS.includes(finishReason)
  ) {
    return "low_confidence:truncated";
  }
  const lower = trimmed.toLowerCase();
  for (const marker of LOW_CONFIDENCE_UNCERTAINTY_MARKERS) {
    if (lower.includes(marker)) {
      return "low_confidence:uncertainty";
    }
  }
  return null;
}

const DEFAULT_VISIBILITY: MentorRuntimeVisibility = {
  hasAttempt: false,
  hasPassed: false,
  hasCompletedPackage: false,
};

const DEFAULT_HINT_MODEL_ID = "claude-3-5-haiku-latest";
const DEFAULT_FEEDBACK_MODEL_ID = "claude-3-5-sonnet-latest";

function modelTierFor(mode: MentorMode): ModelTier {
  // Hints route to the cheaper tier; feedback / draft review / branch
  // explanations get the stronger model. See backlog/05.
  return mode === "hint" || mode === "explain_branch" ? "hint" : "feedback";
}

function modelIdFor(tier: ModelTier): string {
  return tier === "hint" ? DEFAULT_HINT_MODEL_ID : DEFAULT_FEEDBACK_MODEL_ID;
}

/**
 * Construct the gateway used at runtime. Lazy: when `ANTHROPIC_API_KEY` is
 * unset we degrade to a `MockLLMGateway` that returns the authored refusal
 * copy for `flagged_output`. This is the right behaviour for dev /
 * unit-test boots — `AnthropicGateway` would otherwise throw at construct
 * time and crash every mentor request.
 */
export function defaultGateway(): LLMGateway {
  try {
    return new AnthropicGateway();
  } catch {
    const refusal = mentorRefusal({ scope: "flagged_output" });
    const body = `${refusal.title}\n\n${refusal.body}`;
    return new MockLLMGateway(() => body);
  }
}

/**
 * Detect the misconfigured-visibility case the context builder warns about.
 * `buildMentorContext` resolves `always` on the forbidden scopes to `never`
 * but emits a warning. We promote that warning to a hard refusal so the
 * route surfaces it as 500 and the package author gets a signal.
 */
function detectVisibilityMisconfig(stagePolicy: StagePolicy): string | null {
  const v = stagePolicy.mentor_visibility;
  if (v.canonical_solution === "always") {
    return "mentor_visibility.canonical_solution is set to 'always', which is forbidden by design.";
  }
  if (v.branch_solutions === "always") {
    return "mentor_visibility.branch_solutions is set to 'always', which is forbidden by design.";
  }
  return null;
}

function asStagePolicy(value: unknown): StagePolicy {
  // The Stage.stagePolicy JSON is sourced from authored YAML and validated by
  // packages/content-sdk on package build. At runtime we accept it as a
  // pre-validated blob; the context builder enforces visibility rules from
  // here. A defensive cast keeps the runtime narrow without re-running the
  // full Zod schema on every mentor request.
  return value as StagePolicy;
}

/**
 * Run the full mentor pipeline. Returns either the assistant message
 * payload (with telemetry fields populated) or a structured policy error
 * the route should map to a 500.
 */
export async function runMentorRequest(
  input: MentorRuntimeInput,
): Promise<MentorRuntimeOutcome> {
  const prisma = input.prisma ?? (defaultPrisma as unknown as MentorRuntimePrisma);
  const wrap = input.withQueryTimeout ?? defaultWithQueryTimeout;
  const track =
    input.track ??
    (async () => {
      /* no-op default */
    });
  const gateway = input.gateway ?? defaultGateway();
  const stagePolicy = asStagePolicy(input.stage.stagePolicy);
  const visibility = input.visibility ?? DEFAULT_VISIBILITY;

  const misconfig = detectVisibilityMisconfig(stagePolicy);
  if (misconfig !== null) {
    await track("evaluator_redaction_triggered", {
      enrollmentId: input.enrollment.id,
      stageRef: input.stage.ref,
      reason: "visibility_misconfig",
      detail: misconfig,
    });
    return { kind: "policy_misconfig", reason: misconfig };
  }

  // Build mentor context strictly under stage policy. Loaders are deliberately
  // empty here — the web app's content layer will wire the artifact / rubric
  // loaders in a follow-up. The leak-test harness still uses the system
  // prompt assembled from this context.
  const artifactRefs: ReadonlyArray<string> = input.stage.artifactRefs ?? [];
  let context: MentorContext;
  try {
    context = await buildMentorContext({
      stageId: input.stage.ref,
      attempt: 1,
      packageVersionId: input.enrollment.packageVersionId,
      stagePolicy,
      visibilityState: visibility,
      loaders: {
        artifactRefs,
        loadArtifact: async (ref: string) => ({ ref, text: "" }),
        loadRubricCriteria: async () => [],
        loadBranchFeedback: async () => [],
      },
      warn: (msg: string) => {
        // The misconfig detector above should have caught this, but log
        // anything else the context builder warns about for the ops feed.
         
        console.warn(`[mentor-runtime] ${msg}`);
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "context_build_failed";
    await track("evaluator_redaction_triggered", {
      enrollmentId: input.enrollment.id,
      stageRef: input.stage.ref,
      reason: "context_build_failed",
      detail: reason,
    });
    return { kind: "policy_misconfig", reason };
  }

  const tier = modelTierFor(input.mode);
  const modelId = modelIdFor(tier);
  const { systemPrompt, userPrompt } = buildMentorPrompt({
    context,
    learnerInput: input.message,
  });

  const gatewayResponse = await gateway.complete({
    modelTier: tier,
    modelId,
    systemPrompt,
    userPrompt,
    maxOutputTokens: 1024,
  });

  // Leak-test the assembled system prompt against the same gateway. If the
  // gateway leaks any redaction target under adversarial framing, replace
  // the user-visible answer with the authored refusal copy and emit the
  // telemetry event. We use a single-attack subset so the request stays
  // sub-second; the package CI runs the full battery offline.
  const leakResult = await runLeakTests({
    stageId: input.stage.ref,
    gateway,
    redactionTargets: stagePolicy.mentor_redaction_targets ?? [],
    systemPrompt,
    modelTier: tier,
    modelId,
  });

  let assistantText = gatewayResponse.text;
  let redactionTriggered = false;
  let flagged = false;
  let flagReason: string | null = null;

  if (!leakResult.passed) {
    flagged = true;
    flagReason = "policy_violation";
    redactionTriggered = true;
    const refusal = mentorRefusal({ scope: "flagged_output" });
    assistantText = `${refusal.title}\n\n${refusal.body}`;
    await track("evaluator_redaction_triggered", {
      enrollmentId: input.enrollment.id,
      stageRef: input.stage.ref,
      reason: "leak_test_failed",
      attackCount: leakResult.leaks.length,
    });
  } else {
    // Even when the leak-test passes, redact the live response in case the
    // model produced a redaction target verbatim during the actual request.
    const redaction = redact(
      assistantText,
      stagePolicy.mentor_redaction_targets ?? [],
    );
    assistantText = redaction.text;
    if (redaction.triggered) {
      redactionTriggered = true;
      await track("evaluator_redaction_triggered", {
        enrollmentId: input.enrollment.id,
        stageRef: input.stage.ref,
        reason: "redaction_target_matched",
        targetCount: redaction.matchedTargets.length,
      });
    }

    // Low-confidence detection runs on the post-redaction text. Heuristic
    // only — surfaces the message to the review queue but never refuses the
    // learner. See `backlog/05-mentor-safety.md` §Review Queue for follow-ups.
    const lowConfidence = detectLowConfidence(
      assistantText,
      gatewayResponse.finishReason,
    );
    if (lowConfidence !== null) {
      flagged = true;
      flagReason = lowConfidence;
    }
  }

  // Persist thread + user/assistant rows. Find-or-create the thread per
  // (enrollmentId, stageRef) so consecutive messages append to one transcript.
  const existing = await wrap(
    prisma.mentorThread.findFirst({
      where: {
        enrollmentId: input.enrollment.id,
        stageRef: input.stage.ref,
      },
      select: { id: true },
    }),
  );
  const thread =
    existing ??
    (await wrap(
      prisma.mentorThread.create({
        data: {
          enrollmentId: input.enrollment.id,
          stageRef: input.stage.ref,
        },
        select: { id: true },
      }),
    ));

  await wrap(
    prisma.mentorMessage.create({
      data: {
        threadId: thread.id,
        role: "user",
        bodyText: input.message,
      },
      select: { id: true },
    }),
  );

  const assistantRow = await wrap(
    prisma.mentorMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        bodyText: assistantText,
        modelTier: tier,
        modelId,
        provider: gatewayResponse.provider,
        promptTokens: gatewayResponse.promptTokens,
        completionTokens: gatewayResponse.completionTokens,
        redactionTriggered,
        flagged,
      },
      select: { id: true },
    }),
  );

  if (flagged && flagReason !== null) {
    await track("mentor_output_flagged_for_review", {
      enrollmentId: input.enrollment.id,
      stageRef: input.stage.ref,
      threadId: thread.id,
      messageId: assistantRow.id,
      reason: flagReason,
      modelTier: tier,
      modelId,
    });
  }

  return {
    kind: "ok",
    threadId: thread.id,
    messageId: assistantRow.id,
    assistantText,
    redactionTriggered,
    flagged,
    flagReason,
    modelTier: tier,
    modelId,
    provider: gatewayResponse.provider,
    promptTokens: gatewayResponse.promptTokens,
    completionTokens: gatewayResponse.completionTokens,
  };
}
