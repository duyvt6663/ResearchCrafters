/**
 * Tracing helpers for the BullMQ worker.
 *
 * Mirrors `apps/web/lib/tracing.ts` so route handlers and worker job
 * processors share the same call shape (`withSpan(name, fn, attributes)`)
 * without needing to lift the helper into a workspace package — the two
 * apps' module-resolution graphs would diverge otherwise (web compiles
 * through Next, worker compiles through plain `tsc`), and a duplicated
 * helper that's only ~40 lines is easier to maintain than the build wiring.
 *
 * Resilience contract: `@opentelemetry/api` is declared as a runtime dep
 * in `package.json`, but the helper still has to be safe when the module
 * isn't loadable (no exporter wired, edge runtime, fresh checkout that
 * hasn't run `pnpm install` yet). When the module is missing, every
 * helper degrades to a transparent identity wrapper — handlers pay no
 * overhead and the worker still runs.
 */

export type SpanAttributeValue =
  | string
  | number
  | boolean
  | ReadonlyArray<string>
  | ReadonlyArray<number>
  | ReadonlyArray<boolean>;

export type SpanAttributes = Record<string, SpanAttributeValue>;

const TRACER_NAME = 'researchcrafters/worker';

// `@opentelemetry/api` is loaded lazily so the file can be imported even
// when the dep isn't installed yet (e.g. on a fresh checkout before
// `pnpm install` has picked up the new declaration). When it's missing,
// `otelApi` stays `null` and every helper degrades to a no-op.
type OtelApi = {
  trace: {
    getTracer(name: string): {
      startActiveSpan<R>(
        name: string,
        cb: (span: {
          setAttribute(key: string, value: unknown): void;
          recordException(err: unknown): void;
          setStatus(arg: { code: number; message?: string }): void;
          end(): void;
        }) => R,
      ): R;
    };
    getActiveSpan(): {
      setAttribute(key: string, value: unknown): void;
    } | undefined;
  };
  SpanStatusCode: { OK: number; ERROR: number };
  context: unknown;
  propagation: unknown;
};

let otelApi: OtelApi | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  otelApi = require('@opentelemetry/api') as OtelApi;
} catch {
  otelApi = null;
}

export async function withSpan<T>(
  name: string,
  fn: () => Promise<T> | T,
  attributes: SpanAttributes = {},
): Promise<T> {
  if (!otelApi) {
    // No OTel API loadable: identity wrap.
    return await fn();
  }
  const api = otelApi;
  const tracer = api.trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, async (span) => {
    try {
      for (const [k, v] of Object.entries(attributes)) {
        span.setAttribute(k, v as unknown);
      }
      const out = await fn();
      span.setStatus({ code: api.SpanStatusCode.OK });
      return out;
    } catch (err) {
      const e = err as Error;
      span.recordException(e);
      span.setStatus({
        code: api.SpanStatusCode.ERROR,
        message: e?.message ?? 'unknown',
      });
      span.setAttribute('error.type', e?.name ?? 'Error');
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Late-binding attribute setter — useful when the value isn't known until
 * after a DB lookup (e.g. the resolved `runnerMode` for a Run row).
 */
export function setActiveSpanAttributes(attributes: SpanAttributes): void {
  if (!otelApi) return;
  const span = otelApi.trace.getActiveSpan();
  if (!span) return;
  for (const [k, v] of Object.entries(attributes)) {
    span.setAttribute(k, v as unknown);
  }
}

/**
 * Re-attach a parent W3C `traceparent` header value to the current
 * execution context, then run `fn` inside that context. When OTel isn't
 * loaded (or `traceparent` is empty), `fn` runs unwrapped — the result is
 * unchanged either way.
 *
 * The helper exists so `runSubmissionRun` doesn't have to reach into
 * `@opentelemetry/api` itself; that import is forbidden at this file's
 * compile surface when the dep is missing on a fresh checkout.
 */
export async function withTraceparentContext<T>(
  traceparent: string | undefined,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (!otelApi || !traceparent) return await fn();
  const api = otelApi as OtelApi & {
    context: {
      active(): unknown;
      with<R>(ctx: unknown, callback: () => R): R;
    };
    propagation: {
      extract(ctx: unknown, carrier: Record<string, string>): unknown;
    };
  };
  const parent = api.propagation.extract(api.context.active(), {
    traceparent,
  });
  return api.context.with(parent, () => fn()) as Promise<T>;
}
