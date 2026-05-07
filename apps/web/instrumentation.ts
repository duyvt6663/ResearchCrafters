/**
 * OpenTelemetry instrumentation entrypoint.
 *
 * Next.js calls `register()` once at server boot (per the App Router's
 * `instrumentation.ts` convention). We use `@vercel/otel`, which is the
 * Next-recommended path: it wires the Node SDK with sane defaults, handles
 * Edge vs Node runtime split, and Just Works without a custom exporter
 * config in dev (no exporter == no-op spans, but the API surface is live).
 *
 * What this gives us today:
 *   - Auto-instrumented HTTP server spans for every API route hit.
 *   - A live `tracer` consumers can use to start child spans inside
 *     handlers without each one re-importing the SDK.
 *   - Header-based propagation (`traceparent`) so the runner workstream
 *     can attach span context to its callbacks for true end-to-end traces.
 *
 * What it does NOT do yet:
 *   - Export spans anywhere. Set `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g., to
 *     a Tempo / Honeycomb / OTel collector) at deploy time and `@vercel/otel`
 *     will switch the exporter on without code changes.
 *   - Cost-cap or rate-limit traces. We rely on the SDK's default
 *     `parentBased(traceIdRatioBased)` sampler; once a backend is wired
 *     we should set `OTEL_TRACES_SAMPLER` explicitly per environment.
 *
 * Both env-controlled — no recompile needed when ops swap the backend.
 */
export async function register(): Promise<void> {
  // `@vercel/otel` is dynamic-imported so that the Edge runtime (which
  // does not support the Node SDK) can short-circuit cleanly. The
  // `process` global is the cheapest way to detect Node here without
  // importing Next's server-runtime symbols.
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;

  const { registerOTel } = await import("@vercel/otel");
  registerOTel({
    serviceName:
      process.env["OTEL_SERVICE_NAME"] ?? "researchcrafters-web",
    // The instrumentation list is empty by default — `@vercel/otel` already
    // pulls in `fetch`, `pg`, and HTTP server auto-instrumentation. Add
    // explicit instrumentations here only when something falls outside
    // the defaults (e.g., custom Prisma metrics).
  });
}
