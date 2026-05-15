import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Pins the dual-write contract of `apps/web/lib/telemetry.ts`:
 *   1. Delegates to `@researchcrafters/telemetry`'s `track` with the event
 *      `name` injected and string-typed context fields lifted.
 *   2. Failures inside the workspace `track` are swallowed (best-effort).
 *   3. When `POSTHOG_API_KEY` is unset, a structured stderr log is emitted
 *      as a dev fallback. When set, the legacy log is suppressed.
 */

const mocks = vi.hoisted(() => ({
  workspaceTrack: vi.fn(),
}));

vi.mock("@researchcrafters/telemetry", () => ({
  track: mocks.workspaceTrack,
}));

import { track } from "../telemetry";

beforeEach(() => {
  mocks.workspaceTrack.mockReset();
  mocks.workspaceTrack.mockResolvedValue(undefined);
  delete process.env["POSTHOG_API_KEY"];
});

afterEach(() => {
  delete process.env["POSTHOG_API_KEY"];
});

describe("track()", () => {
  it("forwards event name + payload and lifts string context fields", async () => {
    await track("stage_attempt_submitted", {
      enrollmentId: "enr-1",
      stageRef: "S001",
      attemptId: "sa-1",
      persisted: true,
    });

    expect(mocks.workspaceTrack).toHaveBeenCalledTimes(1);
    const [event, ctx] = mocks.workspaceTrack.mock.calls[0]!;
    expect(event).toMatchObject({
      name: "stage_attempt_submitted",
      enrollmentId: "enr-1",
      stageRef: "S001",
      attemptId: "sa-1",
      persisted: true,
    });
    expect(ctx).toEqual({ stageRef: "S001" });
  });

  it("does not lift non-string context fields", async () => {
    await track("package_viewed", {
      surface: "catalog",
      count: 3,
      packageVersionId: null,
    });
    const [, ctx] = mocks.workspaceTrack.mock.calls[0]!;
    expect(ctx).toEqual({});
  });

  it("swallows workspace-track failures", async () => {
    mocks.workspaceTrack.mockRejectedValue(new Error("posthog down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      track("paywall_viewed", { reason: "preview-cap" }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("emits the dev fallback log only when POSTHOG_API_KEY is unset", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await track("paywall_viewed", { reason: "preview-cap" });
    expect(log).toHaveBeenCalledTimes(1);

    process.env["POSTHOG_API_KEY"] = "phc_test";
    await track("paywall_viewed", { reason: "preview-cap" });
    expect(log).toHaveBeenCalledTimes(1);

    log.mockRestore();
  });
});
