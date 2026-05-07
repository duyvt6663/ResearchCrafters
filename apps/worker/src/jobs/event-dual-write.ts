import {
  isAuditGradeEvent,
  type TelemetryEvent,
  type TrackContext,
} from '@researchcrafters/telemetry';

export interface EventDualWriteJob {
  event: TelemetryEvent;
  ctx: TrackContext;
}

export interface EventDualWritePrisma {
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

function payloadFromEvent(event: TelemetryEvent): Record<string, unknown> {
  const entries = Object.entries(event as Record<string, unknown>).filter(
    ([k]) => k !== 'name',
  );
  return Object.fromEntries(entries);
}

/**
 * Persist an event row directly. Used for cases where the inline web request
 * could not await the write (e.g., post-response work) or where we want a
 * second-chance pathway for audit-grade events that bounced off PostHog.
 */
export async function runEventDualWrite(
  job: EventDualWriteJob,
  prisma: EventDualWritePrisma,
): Promise<{ written: boolean }> {
  const { event, ctx } = job;
  const payload = payloadFromEvent(event);
  const auditGrade = isAuditGradeEvent(event.name);

  await prisma.event.create({
    data: {
      name: event.name,
      userId: ctx.userId ?? null,
      packageVersionId: ctx.packageVersionId ?? null,
      stageRef: ctx.stageRef ?? null,
      payload,
      auditGrade,
    },
  });
  return { written: true };
}
