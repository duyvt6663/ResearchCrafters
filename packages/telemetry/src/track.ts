import type { TelemetryEvent, TelemetryEventName } from './events.js';
import { isAuditGradeEvent } from './events.js';
import { getPostHogClient } from './init.js';

export interface TrackContext {
  userId?: string;
  packageVersionId?: string;
  stageRef?: string;
}

/**
 * Test seam — pluggable Prisma-like surface so unit tests can avoid loading
 * the generated client. Production code uses the real `prisma` from
 * `@researchcrafters/db`.
 */
export interface EventStore {
  event: {
    create(args: {
      data: {
        name: string;
        userId?: string | null;
        packageVersionId?: string | null;
        stageRef?: string | null;
        payload: Record<string, unknown>;
        auditGrade: boolean;
      };
    }): Promise<unknown>;
  };
}

let injectedStore: EventStore | null = null;

export function setEventStoreForTests(store: EventStore | null): void {
  injectedStore = store;
}

async function resolveEventStore(): Promise<EventStore | null> {
  if (injectedStore) return injectedStore;
  try {
    const mod = (await import('@researchcrafters/db')) as unknown as {
      prisma: EventStore;
    };
    return mod.prisma;
  } catch {
    return null;
  }
}

function payloadFromEvent(event: TelemetryEvent): Record<string, unknown> {
  // Strip the discriminant from the persisted payload — `name` already lives
  // on the Event row column.
  const entries = Object.entries(event as unknown as Record<string, unknown>).filter(
    ([k]) => k !== 'name',
  );
  return Object.fromEntries(entries);
}

function distinctIdFromContext(ctx: TrackContext): string {
  return ctx.userId ?? 'anonymous';
}

/**
 * Send a typed telemetry event. Always best-effort:
 *   - PostHog write when `POSTHOG_API_KEY` is set; no-op otherwise.
 *   - Audit-grade events additionally land in the Postgres `Event` table.
 *   - Errors are swallowed and logged to stderr.
 */
export async function track(
  event: TelemetryEvent,
  ctx: TrackContext = {},
): Promise<void> {
  const name: TelemetryEventName = event.name;
  const payload = payloadFromEvent(event);

  try {
    const ph = await getPostHogClient();
    if (ph) {
      ph.capture({
        distinctId: distinctIdFromContext(ctx),
        event: name,
        properties: {
          ...payload,
          packageVersionId: ctx.packageVersionId,
          stageRef: ctx.stageRef,
        },
      });
    }
  } catch (err) {
     
    console.warn('[telemetry] posthog capture failed', { event: name, err });
  }

  if (isAuditGradeEvent(name)) {
    try {
      const store = await resolveEventStore();
      if (store) {
        await store.event.create({
          data: {
            name,
            userId: ctx.userId ?? null,
            packageVersionId: ctx.packageVersionId ?? null,
            stageRef: ctx.stageRef ?? null,
            payload,
            auditGrade: true,
          },
        });
      }
    } catch (err) {
       
      console.warn('[telemetry] audit event persist failed', {
        event: name,
        err,
      });
    }
  }
}
