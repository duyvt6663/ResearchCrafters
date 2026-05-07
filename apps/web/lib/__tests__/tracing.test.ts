import { describe, expect, it, vi } from "vitest";
import { withSpan, setActiveSpanAttributes } from "../tracing";

/**
 * Tracing helpers must:
 *  - Run the wrapped function and return its value.
 *  - Be safe when no exporter / no provider is wired (no-op tracer).
 *  - Re-throw original errors so handler control-flow stays the same.
 */

describe("withSpan", () => {
  it("returns the wrapped function's value", async () => {
    const out = await withSpan("test.ok", async () => 42);
    expect(out).toBe(42);
  });

  it("re-throws errors from the wrapped function unchanged", async () => {
    const err = new Error("boom");
    await expect(
      withSpan("test.fail", async () => {
        throw err;
      }),
    ).rejects.toBe(err);
  });

  it("invokes the wrapped function exactly once", async () => {
    const fn = vi.fn(async () => "ok");
    await withSpan("test.once", fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("accepts attributes without throwing in the no-provider default", async () => {
    const out = await withSpan(
      "test.attrs",
      async () => "ok",
      {
        "rc.actor": "u-paid",
        "rc.catalog.size": 7,
        "rc.flag": true,
      },
    );
    expect(out).toBe("ok");
  });
});

describe("setActiveSpanAttributes", () => {
  it("is a no-op when there's no active span (does not throw)", () => {
    expect(() =>
      setActiveSpanAttributes({ "rc.actor": "anon" }),
    ).not.toThrow();
  });

  it("accepts string / number / boolean values", () => {
    expect(() =>
      setActiveSpanAttributes({
        "rc.string": "value",
        "rc.number": 42,
        "rc.bool": true,
      }),
    ).not.toThrow();
  });
});
