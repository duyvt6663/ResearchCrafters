/**
 * OpenTelemetry instrumentation entrypoint for the BullMQ worker.
 *
 * Unlike the Next.js side (`apps/web/instrumentation.ts`), the worker is a
 * plain Node process and so does not get a `register()` lifecycle hook.
 * To boot tracing we expose a top-level await that the operator wires at
 * process start via the Node 22+ `--import` hook:
 *
 *     node --import ./instrumentation.ts dist/index.js
 *     # or
 *     NODE_OPTIONS='--import ./instrumentation.ts' node dist/index.js
 *
 * `package.json` exposes `npm run start:traced` as the canonical traced
 * invocation; `npm run start` keeps the existing untraced behaviour so
 * dev runs and unit tests don't pay any setup cost.
 *
 * What this gives us:
 *   - Auto-instrumented HTTP/fetch spans for callbacks the worker emits
 *     back to the web layer (so the runner -> /api/runs/:id/callback hop
 *     surfaces as a child of the worker job span).
 *   - `@vercel/otel` defaults: env-driven exporter (`OTEL_EXPORTER_OTLP_*`),
 *     `parentBased(traceIdRatioBased)` sampler, no exporter == no-op.
 *   - W3C `traceparent` propagation over fetch — `runSubmissionRun`
 *     attaches the parent context from the BullMQ payload before opening
 *     the worker span, so the same trace-id flows web → queue → worker
 *     → callback.
 *
 * What it does NOT do:
 *   - Configure an exporter URL in code. Set `OTEL_EXPORTER_OTLP_ENDPOINT`
 *     at deploy time and `@vercel/otel` will switch the exporter on.
 *
 * Resilience: when `@vercel/otel` is not installed (fresh checkout, missing
 * deps), the dynamic import is caught and the process boots without
 * tracing. The job processors are still safe — `apps/worker/src/lib/tracing.ts`
 * degrades to identity wrappers when `@opentelemetry/api` is absent.
 */
try {
  const mod = (await import('@vercel/otel')) as {
    registerOTel: (opts: { serviceName: string }) => void;
  };
  mod.registerOTel({
    serviceName:
      process.env['OTEL_SERVICE_NAME'] ?? 'researchcrafters-worker',
  });
} catch (err) {
  // Tracing is optional. If `@vercel/otel` isn't installed yet, surface a
  // single warning and let the process boot without spans.
  console.warn(
    JSON.stringify({
      kind: 'worker_otel_register_skipped',
      error: err instanceof Error ? err.message : String(err),
    }),
  );
}
