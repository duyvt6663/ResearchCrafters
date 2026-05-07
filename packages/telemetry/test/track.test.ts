import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIT_GRADE_EVENTS,
  _resetTelemetryForTests,
  initTelemetry,
  setEventStoreForTests,
  track,
  type EventStore,
  type PostHogLikeClient,
} from '../src/index.js';

function makePostHogStub(): PostHogLikeClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    capture(input) {
      calls.push(input);
    },
  };
}

function makeEventStore(): EventStore & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    event: {
      async create(args) {
        calls.push(args);
        return args;
      },
    },
  };
}

describe('AUDIT_GRADE_EVENTS', () => {
  it('contains exactly the audit-grade taxonomy', () => {
    expect(new Set(AUDIT_GRADE_EVENTS)).toEqual(
      new Set([
        'grade_created',
        'grade_overridden',
        'evaluator_redaction_triggered',
        'subscription_started',
        'branch_feedback_unlocked',
      ]),
    );
  });
});

describe('track', () => {
  beforeEach(() => {
    _resetTelemetryForTests();
    setEventStoreForTests(null);
    delete process.env['POSTHOG_API_KEY'];
  });

  afterEach(() => {
    _resetTelemetryForTests();
    setEventStoreForTests(null);
    delete process.env['POSTHOG_API_KEY'];
  });

  it('calls PostHog capture with event name and payload', async () => {
    const ph = makePostHogStub();
    initTelemetry({ posthogKey: 'phc_test', client: ph });

    await track(
      {
        name: 'package_viewed',
        surface: 'catalog',
        count: 3,
      },
      { userId: 'user_1' },
    );

    expect(ph.calls).toHaveLength(1);
    const captured = ph.calls[0] as {
      distinctId: string;
      event: string;
      properties: Record<string, unknown>;
    };
    expect(captured.event).toBe('package_viewed');
    expect(captured.distinctId).toBe('user_1');
    expect(captured.properties).toMatchObject({ surface: 'catalog', count: 3 });
  });

  it('does not throw and does not call PostHog when POSTHOG_API_KEY is missing', async () => {
    const store = makeEventStore();
    setEventStoreForTests(store);

    await expect(
      track(
        { name: 'package_viewed', surface: 'catalog', count: 1 },
        { userId: 'user_1' },
      ),
    ).resolves.toBeUndefined();
  });

  it('persists audit-grade events to Postgres', async () => {
    const store = makeEventStore();
    setEventStoreForTests(store);

    await track(
      {
        name: 'grade_created',
        gradeId: 'g_1',
        submissionId: 's_1',
        rubricVersion: 'r1',
        evaluatorVersion: 'e1',
        passed: true,
        score: 0.9,
      },
      {
        userId: 'user_1',
        packageVersionId: 'pv_1',
        stageRef: 'S001',
      },
    );

    expect(store.calls).toHaveLength(1);
    const args = store.calls[0] as {
      data: {
        name: string;
        userId: string | null;
        packageVersionId: string | null;
        stageRef: string | null;
        payload: Record<string, unknown>;
        auditGrade: boolean;
      };
    };
    expect(args.data.name).toBe('grade_created');
    expect(args.data.auditGrade).toBe(true);
    expect(args.data.userId).toBe('user_1');
    expect(args.data.packageVersionId).toBe('pv_1');
    expect(args.data.stageRef).toBe('S001');
    expect(args.data.payload).toMatchObject({
      gradeId: 'g_1',
      submissionId: 's_1',
      rubricVersion: 'r1',
      evaluatorVersion: 'e1',
      passed: true,
      score: 0.9,
    });
    // Discriminant should not leak into payload column.
    expect(args.data.payload['name']).toBeUndefined();
  });

  it('does not persist non-audit events', async () => {
    const store = makeEventStore();
    setEventStoreForTests(store);

    await track(
      { name: 'package_viewed', surface: 'catalog', count: 1 },
      { userId: 'user_1' },
    );
    await track(
      {
        name: 'stage_loaded',
        enrollmentId: 'e_1',
        stageRef: 'S001',
      },
      { userId: 'user_1' },
    );

    expect(store.calls).toHaveLength(0);
  });

  it('swallows PostHog capture errors and still persists audit rows', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const explodingClient: PostHogLikeClient = {
      capture() {
        throw new Error('boom');
      },
    };
    initTelemetry({ posthogKey: 'phc_test', client: explodingClient });
    const store = makeEventStore();
    setEventStoreForTests(store);

    await expect(
      track(
        {
          name: 'subscription_started',
          membershipId: 'm_1',
          plan: 'pro',
        },
        { userId: 'user_1' },
      ),
    ).resolves.toBeUndefined();

    expect(store.calls).toHaveLength(1);
    consoleWarn.mockRestore();
  });

  it('uses anonymous distinctId when no userId is provided', async () => {
    const ph = makePostHogStub();
    initTelemetry({ posthogKey: 'phc_test', client: ph });

    await track({ name: 'package_viewed', surface: 'catalog' });

    const captured = ph.calls[0] as { distinctId: string };
    expect(captured.distinctId).toBe('anonymous');
  });
});
