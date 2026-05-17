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
  estimateRequestCostUsd,
  InMemoryMentorContextCache,
  MockLLMGateway,
  redact,
  runLeakTests,
} from "@researchcrafters/ai";
import type {
  LLMGateway,
  MentorContext,
  MentorContextCache,
  ModelTier,
  PriceTable,
  SpendStore,
} from "@researchcrafters/ai";
import type { StagePolicy } from "@researchcrafters/erp-schema";
import { mentorRefusal } from "@researchcrafters/ui/copy";
import {
  prisma as defaultPrisma,
  withQueryTimeout as defaultWithQueryTimeout,
} from "@researchcrafters/db";
import {
  defaultMentorRateLimiter,
  type MentorRateLimitDecision,
  type MentorRateLimiter,
} from "./mentor/rate-limiter.js";
import { defaultMentorSpendStore } from "./mentor/spend-store.js";

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
  /**
   * Authenticated caller's user id. Required for rate-limit and spend-tracking;
   * when omitted both are skipped so legacy callers and offline scripts still
   * exercise the gateway+leak-test path.
   */
  userId?: string;
  /** Override the gateway. Tests inject a `MockLLMGateway`. */
  gateway?: LLMGateway;
  /**
   * Mentor rate limiter. The route wires the process-wide
   * `defaultMentorRateLimiter()`; tests inject a stub or omit entirely
   * (combined with omitting `userId`) to skip the limiter call.
   */
  rateLimiter?: MentorRateLimiter;
  /**
   * Mentor spend store. The route wires the process-wide
   * `defaultMentorSpendStore()`; tests inject a stub or omit entirely
   * (combined with omitting `userId`) to skip spend recording.
   */
  spendStore?: SpendStore;
  /**
   * USD price table keyed by `modelId`. Used to attribute spend per request.
   * Falls back to `defaultMentorPriceTable()` when omitted.
   */
  priceTable?: PriceTable;
   * Optional stage-static context cache. The route wires the process-wide
   * `defaultMentorContextCache()`; tests can pass an isolated cache or omit
   * to skip caching entirely.
   */
  contextCache?: MentorContextCache;
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
  | "mentor_rate_limited";
export type TelemetryPayload = Record<string, string | number | boolean | null>;

export type MentorRuntimeOutcome =
  | {
      kind: "ok";
      threadId: string;
      messageId: string;
      assistantText: string;
      redactionTriggered: boolean;
      flagged: boolean;
      modelTier: ModelTier;
      modelId: string;
      provider: string;
      promptTokens: number;
      completionTokens: number;
      /** USD attributed to this request via the price table (0 when skipped). */
      spentUsd: number;
    }
  | {
      kind: "policy_misconfig";
      reason: string;
    }
  | {
      kind: "rate_limited";
      scope: "per_user" | "per_user_package";
      retryAfterSeconds: number;
    };

const DEFAULT_VISIBILITY: MentorRuntimeVisibility = {
  hasAttempt: false,
  hasPassed: false,
  hasCompletedPackage: false,
};

const DEFAULT_HINT_MODEL_ID = "claude-3-5-haiku-latest";
const DEFAULT_FEEDBACK_MODEL_ID = "claude-3-5-sonnet-latest";

/**
 * Default mentor price table (USD per 1M tokens). Authored from Anthropic's
 * public pricing for the two model ids the runtime ships today. Ops can
 * override at the call site by passing `priceTable` into the runtime when
 * prices shift.
 */
export function defaultMentorPriceTable(): PriceTable {
  return {
    [DEFAULT_HINT_MODEL_ID]: {
      inputPerMillionUsd: 0.8,
      outputPerMillionUsd: 4.0,
    },
    [DEFAULT_FEEDBACK_MODEL_ID]: {
      inputPerMillionUsd: 3.0,
      outputPerMillionUsd: 15.0,
    },
  };
}

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

let _processContextCache: MentorContextCache | undefined;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Return the process-wide stage-static mentor context cache, lazily
 * constructed. Loader callbacks for artifact excerpts, rubric criteria, and
 * branch feedback are deterministic for a given
 * `(packageVersionId, stageId, visibility)` triple, so caching the assembled
 * `MentorContext` skips repeated content reads on every mentor turn.
 *
 * Tunables (env):
 *   - `MENTOR_CONTEXT_CACHE_TTL_MS` (default 300_000 = 5 minutes)
 *   - `MENTOR_CONTEXT_CACHE_MAX_ENTRIES` (default 256)
 *
 * The in-memory variant is deliberately scoped to one Node process; a
 * Redis-backed multi-instance cache is tracked alongside the rate limiter
 * open gap in `backlog/05-mentor-safety.md`.
 */
export function defaultMentorContextCache(): MentorContextCache {
  if (!_processContextCache) {
    _processContextCache = new InMemoryMentorContextCache({
      ttlMs: parsePositiveInt(
        process.env["MENTOR_CONTEXT_CACHE_TTL_MS"],
        5 * 60_000,
      ),
      maxEntries: parsePositiveInt(
        process.env["MENTOR_CONTEXT_CACHE_MAX_ENTRIES"],
        256,
      ),
    });
  }
  return _processContextCache;
}

/** Test-only override to reset the cached cache between suites. */
export function resetDefaultMentorContextCacheForTests(): void {
  _processContextCache = undefined;
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

  // Rate-limit gate. Skipped when the caller did not supply a `userId`
  // (offline scripts, replay tooling). Authenticated route requests always
  // route through here because the route passes `session.userId` and the
  // process-wide `defaultMentorRateLimiter()`.
  if (input.userId !== undefined && input.rateLimiter !== undefined) {
    const decision: MentorRateLimitDecision = await input.rateLimiter.check({
      userId: input.userId,
      packageId: input.enrollment.packageVersionId,
    });
    if (!decision.allowed) {
      await track("mentor_rate_limited", {
        enrollmentId: input.enrollment.id,
        stageRef: input.stage.ref,
        userId: input.userId,
        scope: decision.scope,
        retryAfterSeconds: decision.retryAfterSeconds,
      });
      return {
        kind: "rate_limited",
        scope: decision.scope,
        retryAfterSeconds: decision.retryAfterSeconds,
      };
    }
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
      ...(input.contextCache ? { cache: input.contextCache } : {}),
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

  if (!leakResult.passed) {
    flagged = true;
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

  // Near-real-time spend tracking. Skipped when the caller did not supply
  // `userId` and a `spendStore`. When wired, the runtime converts the
  // provider's actual token counts into USD via the price table and
  // records the result so per-user / per-package / per-stage budget caps
  // see fresh totals on the next request.
  let spentUsd = 0;
  if (input.userId !== undefined && input.spendStore !== undefined) {
    const prices = input.priceTable ?? defaultMentorPriceTable();
    spentUsd = estimateRequestCostUsd(
      modelId,
      gatewayResponse.promptTokens,
      gatewayResponse.completionTokens,
      prices,
    );
    await input.spendStore.recordSpend({
      userId: input.userId,
      packageId: input.enrollment.packageVersionId,
      stageId: input.stage.ref,
      usd: spentUsd,
    });
  }

  return {
    kind: "ok",
    threadId: thread.id,
    messageId: assistantRow.id,
    assistantText,
    redactionTriggered,
    flagged,
    modelTier: tier,
    modelId,
    provider: gatewayResponse.provider,
    promptTokens: gatewayResponse.promptTokens,
    completionTokens: gatewayResponse.completionTokens,
    spentUsd,
  };
}

export { defaultMentorRateLimiter, defaultMentorSpendStore };
