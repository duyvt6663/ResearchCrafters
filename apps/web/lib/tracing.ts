/**
 * Tracing helpers for route handlers and server actions.
 *
 * `withSpan` wraps an async function, opens a span around it, records
 * `error.type` + `error.message` on throw, and re-throws. The point is to
 * keep route handlers unchanged in their happy-path code and let the trace
 * tree fill itself in as features are added.
 *
 * Usage:
 *   export async function GET(req: Request) {
 *     return withSpan("api.packages.list", async () => {
 *       // ...handler body
 *     }, { "rc.actor": session.userId ?? "anon" });
 *   }
 *
 * If `@opentelemetry/api` isn't installed (or we're on the Edge runtime),
 * `withSpan` is a transparent identity wrapper — handlers pay no overhead.
 */
import { trace, SpanStatusCode } from "@opentelemetry/api";

const TRACER_NAME = "researchcrafters/web";

export type SpanAttributes = Record<string, string | number | boolean>;

export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes: SpanAttributes = {},
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, async (span) => {
    try {
      for (const [k, v] of Object.entries(attributes)) {
        span.setAttribute(k, v);
      }
      const out = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return out;
    } catch (err) {
      const e = err as Error;
      span.recordException(e);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: e?.message ?? "unknown",
      });
      span.setAttribute("error.type", e?.name ?? "Error");
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Cheap helper for handlers that just want to enrich the active server
 * span (created by `@vercel/otel`) without opening a new one. Useful for
 * recording the resolved entity id once we've looked it up.
 */
export function setActiveSpanAttributes(attributes: SpanAttributes): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  for (const [k, v] of Object.entries(attributes)) {
    span.setAttribute(k, v);
  }
}
