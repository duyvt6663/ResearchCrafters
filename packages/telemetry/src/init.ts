export interface PostHogLikeClient {
  capture(input: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }): void;
  shutdown?: () => Promise<void> | void;
}

export interface InitTelemetryOptions {
  posthogKey?: string;
  host?: string;
  /** Test seam — inject a custom PostHog-like client. */
  client?: PostHogLikeClient;
}

interface TelemetryState {
  configured: boolean;
  client: PostHogLikeClient | null;
  posthogKey: string | undefined;
  host: string | undefined;
}

const state: TelemetryState = {
  configured: false,
  client: null,
  posthogKey: undefined,
  host: undefined,
};

/**
 * Configure the singleton telemetry client. Safe to call multiple times — the
 * latest call wins. Calling without arguments lets `track()` fall back to env
 * vars on first use.
 */
export function initTelemetry(opts: InitTelemetryOptions = {}): void {
  state.posthogKey = opts.posthogKey;
  state.host = opts.host;
  state.client = opts.client ?? null;
  state.configured = true;
}

/**
 * Reset internal state. Used by tests; not part of the public API surface.
 */
export function _resetTelemetryForTests(): void {
  state.configured = false;
  state.client = null;
  state.posthogKey = undefined;
  state.host = undefined;
}

/**
 * Resolve the PostHog client lazily so importing the module never requires
 * `POSTHOG_API_KEY`. Returns `null` when no key is configured — callers must
 * tolerate this and skip the network write.
 */
export async function getPostHogClient(): Promise<PostHogLikeClient | null> {
  if (state.client) return state.client;

  const key = state.posthogKey ?? process.env['POSTHOG_API_KEY'];
  if (!key) return null;

  const host = state.host ?? process.env['POSTHOG_HOST'] ?? 'https://us.i.posthog.com';

  try {
    const mod = (await import('posthog-node')) as {
      PostHog: new (key: string, opts: { host: string }) => PostHogLikeClient;
    };
    const client = new mod.PostHog(key, { host });
    state.client = client;
    return client;
  } catch {
    return null;
  }
}
