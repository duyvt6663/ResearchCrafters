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

  it("propagates the return value of a synchronous (non-Promise) arrow", async () => {
    // Some call sites prefer to write `withSpan(name, () => syncResult)`
    // rather than wrapping a body in `async` for one trivial expression.
    // The helper must accept either; if it ever stops awaiting the value
    // we'd silently start returning a Promise<unknown> here.
    const out = await withSpan("test.sync", () => "sync-value");
    expect(out).toBe("sync-value");
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

  it("accepts arrays of strings / numbers / booleans", () => {
    // Some attributes (e.g. an array of stage refs traversed in a session,
    // or a vector of byte sizes per uploaded file) are list-shaped. The
    // OTel spec allows homogeneous arrays of scalars, so the helper has to
    // pass them through to `setAttribute` as-is rather than stringifying.
    expect(() =>
      setActiveSpanAttributes({
        "rc.stage_refs": ["S001", "S002", "S003"],
        "rc.byte_sizes": [128, 256, 512],
        "rc.flags": [true, false, true],
      }),
    ).not.toThrow();
  });
});
