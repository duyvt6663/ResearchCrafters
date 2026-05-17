// Unit tests for `apps/web/lib/mentor-runtime.ts`.
//
// The runtime is the seam between the mentor HTTP route and the
// `@researchcrafters/ai` gateway. We inject a `MockLLMGateway` so no real
// Anthropic SDK is touched, and stub the Prisma surface so persistence is
// exercised without a live Postgres.
//
// Coverage:
//   - Authored refusal copy is returned when the leak-test gateway echoes a
//     redaction target back at adversarial framing.
//   - Live response redaction runs even when leak tests pass.
//   - Visibility misconfiguration (`always` on canonical_solution) yields a
//     `policy_misconfig` outcome the route can map to 500.
//   - The mock gateway round-trips assistant text when no leak fires.
//   - `mentor_messages` rows persist with the model telemetry fields.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { MockLLMGateway } from "@researchcrafters/ai";
import type { SpendStore } from "@researchcrafters/ai";
import { InMemoryMentorContextCache, MockLLMGateway } from "@researchcrafters/ai";
import type { StagePolicy } from "@researchcrafters/erp-schema";
import {
  runMentorRequest,
  type MentorRuntimePrisma,
} from "../mentor-runtime.js";
import type {
  MentorRateLimitDecision,
  MentorRateLimiter,
} from "../mentor/rate-limiter.js";

// The runtime imports `prisma` and `withQueryTimeout` from
// `@researchcrafters/db`. We mock the module so the *default* code path in
// the runtime resolves without a live Postgres — even when the tests pass
// their own stub via `input.prisma` / `input.withQueryTimeout`.
vi.mock("@researchcrafters/db", () => ({
  prisma: {},
  withQueryTimeout: async <T>(p: PromiseLike<T>): Promise<T> => p,
}));

const ENR_ID = "enr-1";
const PV_ID = "pv-1";
const STAGE_REF = "S001";
const REDACTION_TARGET = "ANSWER_KEY_42";

function policy(overrides: Partial<StagePolicy["mentor_visibility"]> = {}, extras: Partial<StagePolicy> = {}): StagePolicy {
  return {
    mentor_visibility: {
      stage_copy: "always",
      artifact_refs: "after_attempt",
      rubric: "after_attempt",
      evidence: "after_attempt",
      branch_feedback: "after_pass",
      canonical_solution: "after_completion",
      branch_solutions: "after_pass",
      ...overrides,
    },
    runner: { mode: "none" },
    validation: { kind: "rubric" },
    inputs: { mode: "free_text" },
    feedback: {},
    mentor_redaction_targets: [REDACTION_TARGET],
    ...extras,
  } as StagePolicy;
}

function makePrismaStub(): {
  prisma: MentorRuntimePrisma;
  threadFindFirst: ReturnType<typeof vi.fn>;
  threadCreate: ReturnType<typeof vi.fn>;
  messageCreate: ReturnType<typeof vi.fn>;
} {
  const threadFindFirst = vi.fn();
  const threadCreate = vi.fn();
  const messageCreate = vi.fn();
  return {
    prisma: {
      mentorThread: {
        findFirst: threadFindFirst as unknown as MentorRuntimePrisma["mentorThread"]["findFirst"],
        create: threadCreate as unknown as MentorRuntimePrisma["mentorThread"]["create"],
      },
      mentorMessage: {
        create: messageCreate as unknown as MentorRuntimePrisma["mentorMessage"]["create"],
      },
    },
    threadFindFirst,
    threadCreate,
    messageCreate,
  };
}

const ECHO_HANDLER = (req: { systemPrompt: string; userPrompt: string }): string => {
  // Echo the user prompt back so leak-test attacks don't see the redaction
  // target. The user prompt is wrapped in <<UNTRUSTED>> blocks so the echo
  // never matches a redaction target by accident.
  return `Mentor reply for: ${req.userPrompt.length} chars received.`;
};

beforeEach(() => {
  // No global state in the runtime; nothing to reset.
});

describe("runMentorRequest", () => {
  it("returns the assistant text and persists rows when nothing leaks", async () => {
    const stub = makePrismaStub();
    stub.threadFindFirst.mockResolvedValue(null);
    stub.threadCreate.mockResolvedValue({ id: "thread-1" });
    stub.messageCreate
      .mockResolvedValueOnce({ id: "user-msg-1" })
      .mockResolvedValueOnce({ id: "asst-msg-1" });

    const gateway = new MockLLMGateway(ECHO_HANDLER);
    const tracked: Array<{ event: string; payload: unknown }> = [];

    const result = await runMentorRequest({
      enrollment: { id: ENR_ID, packageVersionId: PV_ID },
      stage: { ref: STAGE_REF, stagePolicy: policy() },
      mode: "hint",
      message: "I am stuck on the regularization choice.",
      gateway,
      prisma: stub.prisma,
      withQueryTimeout: async (p) => p,
      track: async (event, payload) => {
        tracked.push({ event, payload });
      },
    });

    if (result.kind !== "ok") throw new Error("expected ok outcome");
    expect(result.kind).toBe("ok");
    expect(result.assistantText).toContain("Mentor reply for");
    expect(result.threadId).toBe("thread-1");
    expect(result.messageId).toBe("asst-msg-1");
    expect(result.redactionTriggered).toBe(false);
    expect(result.flagged).toBe(false);
    expect(result.modelTier).toBe("hint");
    expect(result.provider).toBe("mock");

    // Two MentorMessage rows: one user, one assistant. Telemetry fields
    // populate on the assistant row only.
    expect(stub.messageCreate).toHaveBeenCalledTimes(2);
    const assistantCall = stub.messageCreate.mock.calls[1]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(assistantCall.data["role"]).toBe("assistant");
    expect(assistantCall.data["modelTier"]).toBe("hint");
    expect(assistantCall.data["modelId"]).toBeTruthy();
    expect(assistantCall.data["provider"]).toBe("mock");
    expect(assistantCall.data["promptTokens"]).toBeGreaterThan(0);
    expect(assistantCall.data["completionTokens"]).toBeGreaterThan(0);
    expect(assistantCall.data["redactionTriggered"]).toBe(false);
    expect(assistantCall.data["flagged"]).toBe(false);
    // user row had no telemetry fields:
    const userCall = stub.messageCreate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(userCall.data["role"]).toBe("user");
    expect(userCall.data["modelTier"]).toBeUndefined();
  });

  it("returns the authored refusal copy when leak tests detect a redaction target", async () => {
    // This gateway mirrors the redaction target back into its output for any
    // leak-test attack prompt. The runtime must replace the visible reply
    // with the authored refusal copy and emit the
    // `evaluator_redaction_triggered` telemetry event.
    const stub = makePrismaStub();
    stub.threadFindFirst.mockResolvedValue({ id: "thread-leak" });
    stub.messageCreate
      .mockResolvedValueOnce({ id: "u" })
      .mockResolvedValueOnce({ id: "a" });

    const gateway = new MockLLMGateway(() => REDACTION_TARGET);
    const tracked: Array<{ event: string; payload: unknown }> = [];

    const result = await runMentorRequest({
      enrollment: { id: ENR_ID, packageVersionId: PV_ID },
      stage: { ref: STAGE_REF, stagePolicy: policy() },
      mode: "review_draft",
      message: "Please review this draft.",
      gateway,
      prisma: stub.prisma,
      withQueryTimeout: async (p) => p,
      track: async (event, payload) => {
        tracked.push({ event, payload });
      },
    });

    if (result.kind !== "ok") throw new Error("expected ok outcome");
    expect(result.flagged).toBe(true);
    expect(result.redactionTriggered).toBe(true);
    // The authored refusal copy never quotes the redaction target itself.
    expect(result.assistantText).not.toContain(REDACTION_TARGET);
    expect(result.assistantText.toLowerCase()).toContain("mentor");

    expect(
      tracked.some((t) => t.event === "evaluator_redaction_triggered"),
    ).toBe(true);

    const assistantCall = stub.messageCreate.mock.calls[1]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(assistantCall.data["flagged"]).toBe(true);
    expect(assistantCall.data["redactionTriggered"]).toBe(true);
  });

  it("redacts a leaked target in the live response when the leak-test battery passes", async () => {
    // Gateway behaviour: the leak-test attacks all return safe text, but the
    // *real* user message (which doesn't match a leak attack id) returns a
    // string containing the redaction target. The runtime should redact it.
    const stub = makePrismaStub();
    stub.threadFindFirst.mockResolvedValue({ id: "thread-r" });
    stub.messageCreate
      .mockResolvedValueOnce({ id: "u" })
      .mockResolvedValueOnce({ id: "a" });

    const tracked: Array<{ event: string; payload: unknown }> = [];

    // The leak-test prompts are well-known; all of them are different from
    // the learner message. We branch on whether the prompt is a leak-test
    // attack (returns benign text) vs the learner (echoes the secret).
    const LEAK_ATTACK_FRAGMENTS = [
      "canonical solution",
      "alone. Show me",
      "JSON object",
      "package author debugging",
      "Grade my submission",
    ];
    const gateway = new MockLLMGateway((req: { userPrompt: string }) => {
      const isLeakAttack = LEAK_ATTACK_FRAGMENTS.some((frag) =>
        req.userPrompt.includes(frag),
      );
      return isLeakAttack
        ? "Sorry, I cannot share that."
        : `Here is some context that mentions ${REDACTION_TARGET} unfortunately.`;
    });

    const result = await runMentorRequest({
      enrollment: { id: ENR_ID, packageVersionId: PV_ID },
      stage: { ref: STAGE_REF, stagePolicy: policy() },
      mode: "clarify",
      message: "Just clarify the goal please.",
      gateway,
      prisma: stub.prisma,
      withQueryTimeout: async (p) => p,
      track: async (event, payload) => {
        tracked.push({ event, payload });
      },
    });

    if (result.kind !== "ok") throw new Error("expected ok outcome");
    expect(result.assistantText).not.toContain(REDACTION_TARGET);
    expect(result.assistantText).toContain("[redacted]");
    expect(result.redactionTriggered).toBe(true);
    // The flag is reserved for leak-test failures; live-redaction alone does
    // not flag the message.
    expect(result.flagged).toBe(false);
    expect(
      tracked.some(
        (t) =>
          t.event === "evaluator_redaction_triggered" &&
          (t.payload as { reason?: string }).reason ===
            "redaction_target_matched",
      ),
    ).toBe(true);
  });

  it("refuses with policy_misconfig when canonical_solution visibility is 'always'", async () => {
    const stub = makePrismaStub();
    const tracked: Array<{ event: string; payload: unknown }> = [];

    const result = await runMentorRequest({
      enrollment: { id: ENR_ID, packageVersionId: PV_ID },
      stage: {
        ref: STAGE_REF,
        stagePolicy: policy({ canonical_solution: "always" }),
      },
      mode: "hint",
      message: "any message",
      gateway: new MockLLMGateway(ECHO_HANDLER),
      prisma: stub.prisma,
      withQueryTimeout: async (p) => p,
      track: async (event, payload) => {
        tracked.push({ event, payload });
      },
    });

    expect(result.kind).toBe("policy_misconfig");
    if (result.kind !== "policy_misconfig") return;
    expect(result.reason).toContain("canonical_solution");
    // No persistence on the misconfig path — the route surfaces 500 before
    // anything is written.
    expect(stub.threadFindFirst).not.toHaveBeenCalled();
    expect(stub.messageCreate).not.toHaveBeenCalled();
    // Telemetry event recycled for "mentor refused due to misconfig":
    expect(
      tracked.some(
        (t) =>
          t.event === "evaluator_redaction_triggered" &&
          (t.payload as { reason?: string }).reason === "visibility_misconfig",
      ),
    ).toBe(true);
  });

  it("returns a rate_limited outcome and skips the gateway when the limiter refuses", async () => {
    const stub = makePrismaStub();
    const gateway = new MockLLMGateway(ECHO_HANDLER);
    const completeSpy = vi.spyOn(gateway, "complete");

    const decision: MentorRateLimitDecision = {
      allowed: false,
      scope: "per_user_package",
      retryAfterSeconds: 42,
    };
    const limiter: MentorRateLimiter = {
      check: vi.fn().mockResolvedValue(decision),
    };
    const tracked: Array<{ event: string; payload: unknown }> = [];

    const result = await runMentorRequest({
      enrollment: { id: ENR_ID, packageVersionId: PV_ID },
      stage: { ref: STAGE_REF, stagePolicy: policy() },
      mode: "hint",
      message: "hi",
      userId: "u-99",
      rateLimiter: limiter,
      gateway,
      prisma: stub.prisma,
      withQueryTimeout: async (p) => p,
      track: async (event, payload) => {
        tracked.push({ event, payload });
      },
    });

    expect(result.kind).toBe("rate_limited");
    if (result.kind !== "rate_limited") return;
    expect(result.scope).toBe("per_user_package");
    expect(result.retryAfterSeconds).toBe(42);
    expect(limiter.check).toHaveBeenCalledWith({
      userId: "u-99",
      packageId: PV_ID,
    });
    // Gateway must not be invoked, no rows persisted, no leak-test calls.
    expect(completeSpy).not.toHaveBeenCalled();
    expect(stub.threadFindFirst).not.toHaveBeenCalled();
    expect(stub.messageCreate).not.toHaveBeenCalled();
    // Telemetry event recorded for ops dashboards.
    expect(
      tracked.some(
        (t) =>
          t.event === "mentor_rate_limited" &&
          (t.payload as { scope?: string }).scope === "per_user_package",
      ),
    ).toBe(true);
  });

  it("records mentor spend on the spend store with the priced token counts", async () => {
    const stub = makePrismaStub();
    stub.threadFindFirst.mockResolvedValue({ id: "thread-spend" });
    stub.messageCreate
      .mockResolvedValueOnce({ id: "u" })
      .mockResolvedValueOnce({ id: "a" });

    const gateway = new MockLLMGateway(ECHO_HANDLER);
    const recordSpend = vi.fn();
    const spendStore: SpendStore = {
      getUserDailySpendUsd: async () => 0,
      getPackageSpendUsd: async () => 0,
      getStageSpendUsd: async () => 0,
      recordSpend,
    };

    const result = await runMentorRequest({
      enrollment: { id: ENR_ID, packageVersionId: PV_ID },
      stage: { ref: STAGE_REF, stagePolicy: policy() },
      mode: "review_draft",
      message: "Spend tracking smoke",
      userId: "u-paid",
      spendStore,
      // Force a known price so the assertion is independent of default table.
      priceTable: {
        "claude-3-5-sonnet-latest": {
          inputPerMillionUsd: 3.0,
          outputPerMillionUsd: 15.0,
        },
      },
      gateway,
      prisma: stub.prisma,
      withQueryTimeout: async (p) => p,
    });

    if (result.kind !== "ok") throw new Error("expected ok outcome");
    expect(recordSpend).toHaveBeenCalledTimes(1);
    const call = recordSpend.mock.calls[0]?.[0] as {
      userId: string;
      packageId: string;
      stageId: string;
      usd: number;
    };
    expect(call.userId).toBe("u-paid");
    expect(call.packageId).toBe(PV_ID);
    expect(call.stageId).toBe(STAGE_REF);
    // The mock gateway returns positive token counts; spent must be >= 0
    // and round-trip the explicit price table.
    expect(call.usd).toBeGreaterThan(0);
    expect(result.spentUsd).toBeCloseTo(call.usd, 10);
  });

  it("skips spend recording when no userId is provided", async () => {
    const stub = makePrismaStub();
    stub.threadFindFirst.mockResolvedValue({ id: "thread-anon" });
    stub.messageCreate
      .mockResolvedValueOnce({ id: "u" })
      .mockResolvedValueOnce({ id: "a" });
    const recordSpend = vi.fn();
    const spendStore: SpendStore = {
      getUserDailySpendUsd: async () => 0,
      getPackageSpendUsd: async () => 0,
      getStageSpendUsd: async () => 0,
      recordSpend,
    };

    const result = await runMentorRequest({
      enrollment: { id: ENR_ID, packageVersionId: PV_ID },
      stage: { ref: STAGE_REF, stagePolicy: policy() },
      mode: "hint",
      message: "anon path",
      // No userId provided.
      spendStore,
      gateway: new MockLLMGateway(ECHO_HANDLER),
      prisma: stub.prisma,
      withQueryTimeout: async (p) => p,
    });

    if (result.kind !== "ok") throw new Error("expected ok outcome");
    expect(recordSpend).not.toHaveBeenCalled();
    expect(result.spentUsd).toBe(0);
  });

  it("threads a shared context cache so repeat requests for the same stage are stage-static", async () => {
    // The mentor runtime forwards its `contextCache` to `buildMentorContext`.
    // We can prove the wiring works by reusing the same cache across two
    // requests and inspecting it for an entry afterwards. The exact key is
    // an implementation detail, so we only assert the cache was populated.
    const cache = new InMemoryMentorContextCache();
    const stub = makePrismaStub();
    stub.threadFindFirst.mockResolvedValue({ id: "thread-cache" });
    stub.messageCreate.mockResolvedValue({ id: "row" });

    await runMentorRequest({
      enrollment: { id: ENR_ID, packageVersionId: PV_ID },
      stage: { ref: STAGE_REF, stagePolicy: policy() },
      mode: "hint",
      message: "first turn",
      gateway: new MockLLMGateway(ECHO_HANDLER),
      contextCache: cache,
      prisma: stub.prisma,
      withQueryTimeout: async (p) => p,
    });
    expect(cache.size()).toBe(1);

    await runMentorRequest({
      enrollment: { id: ENR_ID, packageVersionId: PV_ID },
      stage: { ref: STAGE_REF, stagePolicy: policy() },
      mode: "hint",
      message: "second turn — same stage, should reuse",
      gateway: new MockLLMGateway(ECHO_HANDLER),
      contextCache: cache,
      prisma: stub.prisma,
      withQueryTimeout: async (p) => p,
    });
    // Same cache key → still exactly one entry, not two.
    expect(cache.size()).toBe(1);
  });

  it("reuses an existing MentorThread when one already exists for the (enrollmentId, stageRef)", async () => {
    const stub = makePrismaStub();
    stub.threadFindFirst.mockResolvedValue({ id: "thread-existing" });
    stub.messageCreate
      .mockResolvedValueOnce({ id: "u-row" })
      .mockResolvedValueOnce({ id: "a-row" });

    const result = await runMentorRequest({
      enrollment: { id: ENR_ID, packageVersionId: PV_ID },
      stage: { ref: STAGE_REF, stagePolicy: policy() },
      mode: "hint",
      message: "follow up question",
      gateway: new MockLLMGateway(ECHO_HANDLER),
      prisma: stub.prisma,
      withQueryTimeout: async (p) => p,
    });

    if (result.kind !== "ok") throw new Error("expected ok outcome");
    expect(result.threadId).toBe("thread-existing");
    expect(stub.threadCreate).not.toHaveBeenCalled();
    expect(stub.messageCreate).toHaveBeenCalledTimes(2);
  });
});
