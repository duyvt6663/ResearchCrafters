import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RunStatusPanel } from "../src/components/RunStatusPanel.js";

/**
 * Server-render coverage for the execution-failure banner introduced
 * alongside the roadmap item "Add run logs and execution failure handling"
 * (`backlog/00-roadmap.md:67`).
 *
 * Network-fetch behaviour (the `runId` self-fetch path) lives behind a
 * `useEffect` and is intentionally not exercised by SSR — it is wired so
 * that callers that omit `runId` continue to render the prop-driven
 * variant exactly as before.
 */
describe("RunStatusPanel — execution failure handling", () => {
  it("does not render a failure banner when execution status is ok", () => {
    const html = renderToStaticMarkup(
      <RunStatusPanel
        lines={[
          { ts: "2026-05-15T00:00:00.000Z", severity: "info", text: "hello" },
        ]}
        executionStatus="ok"
      />,
    );
    expect(html).not.toContain("execution-failure-banner");
  });

  it("renders the authored failure copy for timeout", () => {
    const html = renderToStaticMarkup(
      <RunStatusPanel lines={[]} executionStatus="timeout" />,
    );
    expect(html).toContain("execution-failure-banner");
    expect(html).toContain('data-execution-status="timeout"');
    expect(html).toContain("Run hit the wall-clock timeout.");
    expect(html).toContain(
      "Profile the slow path locally with",
    );
  });

  it("renders the authored failure copy for oom", () => {
    const html = renderToStaticMarkup(
      <RunStatusPanel lines={[]} executionStatus="oom" />,
    );
    expect(html).toContain('data-execution-status="oom"');
    expect(html).toContain("Run ran out of memory.");
  });

  it("renders the authored failure copy for crash", () => {
    const html = renderToStaticMarkup(
      <RunStatusPanel lines={[]} executionStatus="crash" />,
    );
    expect(html).toContain('data-execution-status="crash"');
    expect(html).toContain("Sandbox or runtime crashed.");
  });

  it("renders the authored failure copy for exit_nonzero", () => {
    const html = renderToStaticMarkup(
      <RunStatusPanel lines={[]} executionStatus="exit_nonzero" />,
    );
    expect(html).toContain('data-execution-status="exit_nonzero"');
    expect(html).toContain("Command exited with a non-zero code.");
  });

  it("keeps log lines rendered alongside the failure banner", () => {
    const html = renderToStaticMarkup(
      <RunStatusPanel
        lines={[
          {
            ts: "2026-05-15T00:00:00.000Z",
            severity: "error",
            text: "Killed: 9",
          },
        ]}
        executionStatus="oom"
      />,
    );
    expect(html).toContain("execution-failure-banner");
    expect(html).toContain("Killed: 9");
  });

  it("renders without crashing when only runId is supplied (SSR seed)", () => {
    const html = renderToStaticMarkup(<RunStatusPanel runId="run_abc123" />);
    expect(html).toContain('aria-label="Run status"');
    expect(html).not.toContain("execution-failure-banner");
    expect(html).not.toContain("log-fetch-error");
  });
});
