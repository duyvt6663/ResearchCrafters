import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BRANCH_STATS_ROLLUP_CRON,
  SCHEDULED_BRANCH_STATS_COHORTS,
  _setLivePackageVersionsLookupForTests,
  _setQueueFactoryForTests,
  installSchedules,
  removeAllSchedules,
  type AddOptions,
  type RepeatOptions,
  type SchedulerQueue,
} from '../src/scheduler.js';
import { BRANCH_STATS_ROLLUP_QUEUE } from '../src/queues.js';

interface AddCall {
  jobName: string;
  payload: unknown;
  opts: AddOptions | undefined;
}

interface RemoveCall {
  jobName: string;
  repeat: RepeatOptions;
  jobId: string | undefined;
}

interface FakeQueueState {
  name: string;
  adds: AddCall[];
  removes: RemoveCall[];
  closed: number;
  // Map of "jobName|jobId|pattern" -> presence; mimics BullMQ's repeat dedupe.
  registered: Set<string>;
}

function repeatKey(name: string, jobId: string | undefined, pattern: string): string {
  return `${name}|${jobId ?? '*'}|${pattern}`;
}

function makeFakeQueue(name: string): {
  queue: SchedulerQueue;
  state: FakeQueueState;
} {
  const state: FakeQueueState = {
    name,
    adds: [],
    removes: [],
    closed: 0,
    registered: new Set<string>(),
  };
  const queue: SchedulerQueue = {
    name,
    async add(jobName, payload, opts) {
      state.adds.push({ jobName, payload, opts });
      if (opts?.repeat) {
        // Idempotent: BullMQ silently no-ops if the (name, jobId, pattern)
        // triple matches an already-registered repeatable.
        state.registered.add(repeatKey(jobName, opts.jobId, opts.repeat.pattern));
      }
      return { id: `job-${state.adds.length}` };
    },
    async removeRepeatable(jobName, repeat, jobId) {
      state.removes.push({ jobName, repeat, jobId });
      const key = repeatKey(jobName, jobId, repeat.pattern);
      const had = state.registered.delete(key);
      return had;
    },
    async close() {
      state.closed += 1;
      return undefined;
    },
  };
  return { queue, state };
}

describe('installSchedules', () => {
  let lastState: FakeQueueState | null = null;

  beforeEach(() => {
    lastState = null;
    _setLivePackageVersionsLookupForTests(async () => ['pv_1']);
    _setQueueFactoryForTests((queueName) => {
      const { queue, state } = makeFakeQueue(queueName);
      lastState = state;
      return queue;
    });
  });

  afterEach(() => {
    _setQueueFactoryForTests(null);
    _setLivePackageVersionsLookupForTests(null);
  });

  it('registers a repeating job per scheduled cohort', async () => {
    const installed = await installSchedules({ url: 'redis://test' });

    expect(installed).toHaveLength(SCHEDULED_BRANCH_STATS_COHORTS.length);
    expect(lastState).not.toBeNull();
    const state = lastState!;

    expect(state.adds).toHaveLength(SCHEDULED_BRANCH_STATS_COHORTS.length);
    for (const cohort of SCHEDULED_BRANCH_STATS_COHORTS) {
      const call = state.adds.find(
        (a) => (a.payload as { cohort: string }).cohort === cohort,
      );
      expect(call, `add() for cohort=${cohort}`).toBeDefined();
      expect(call!.jobName).toBe(BRANCH_STATS_ROLLUP_QUEUE);
      expect(call!.opts?.repeat?.pattern).toBe(BRANCH_STATS_ROLLUP_CRON);
      expect(call!.opts?.jobId).toBe(
        `branch-stats-rollup:pv_1:${cohort}`,
      );

      const payload = call!.payload as {
        packageVersionId: string;
        cohort: string;
        windowStart: string;
        windowEnd: string;
      };
      expect(payload.packageVersionId).toBe('pv_1');
      // windowEnd - windowStart should be ~1h.
      const span =
        new Date(payload.windowEnd).getTime() -
        new Date(payload.windowStart).getTime();
      expect(span).toBe(60 * 60 * 1000);
    }

    // Each install should close the producer queue handle once.
    expect(state.closed).toBe(1);
  });

  it('is idempotent — calling twice does not register duplicate repeat keys', async () => {
    // Two boots, both reuse the same fake queue so we can observe the dedupe.
    const sharedState = { state: null as FakeQueueState | null };
    _setQueueFactoryForTests((queueName) => {
      if (sharedState.state) {
        // Re-use across calls so the `registered` Set persists.
        const reused: SchedulerQueue = {
          name: sharedState.state.name,
          add: async (jobName, payload, opts) => {
            sharedState.state!.adds.push({ jobName, payload, opts });
            if (opts?.repeat) {
              sharedState.state!.registered.add(
                repeatKey(jobName, opts.jobId, opts.repeat.pattern),
              );
            }
            return { id: `j-${sharedState.state!.adds.length}` };
          },
          removeRepeatable: async (jobName, repeat, jobId) => {
            sharedState.state!.removes.push({ jobName, repeat, jobId });
            return sharedState.state!.registered.delete(
              repeatKey(jobName, jobId, repeat.pattern),
            );
          },
          close: async () => {
            sharedState.state!.closed += 1;
          },
        };
        return reused;
      }
      const { queue, state } = makeFakeQueue(queueName);
      sharedState.state = state;
      return queue;
    });

    await installSchedules({ url: 'redis://test' });
    await installSchedules({ url: 'redis://test' });

    expect(sharedState.state).not.toBeNull();
    const state = sharedState.state!;

    // 2 installs * N cohorts add() calls — but only N unique repeat keys.
    expect(state.adds).toHaveLength(SCHEDULED_BRANCH_STATS_COHORTS.length * 2);
    expect(state.registered.size).toBe(SCHEDULED_BRANCH_STATS_COHORTS.length);
  });
});

describe('removeAllSchedules', () => {
  beforeEach(() => {
    _setLivePackageVersionsLookupForTests(async () => ['pv_1']);
  });
  afterEach(() => {
    _setQueueFactoryForTests(null);
    _setLivePackageVersionsLookupForTests(null);
  });

  it('cancels every cohort schedule that was previously installed', async () => {
    const sharedState = { state: null as FakeQueueState | null };
    _setQueueFactoryForTests((queueName) => {
      if (!sharedState.state) {
        const { queue, state } = makeFakeQueue(queueName);
        sharedState.state = state;
        return queue;
      }
      const reused: SchedulerQueue = {
        name: sharedState.state.name,
        add: async (jobName, payload, opts) => {
          sharedState.state!.adds.push({ jobName, payload, opts });
          if (opts?.repeat) {
            sharedState.state!.registered.add(
              repeatKey(jobName, opts.jobId, opts.repeat.pattern),
            );
          }
          return { id: `j-${sharedState.state!.adds.length}` };
        },
        removeRepeatable: async (jobName, repeat, jobId) => {
          sharedState.state!.removes.push({ jobName, repeat, jobId });
          return sharedState.state!.registered.delete(
            repeatKey(jobName, jobId, repeat.pattern),
          );
        },
        close: async () => {
          sharedState.state!.closed += 1;
        },
      };
      return reused;
    });

    await installSchedules({ url: 'redis://test' });
    const removed = await removeAllSchedules({ url: 'redis://test' });

    expect(removed).toBe(SCHEDULED_BRANCH_STATS_COHORTS.length);
    expect(sharedState.state!.registered.size).toBe(0);
    // One remove per cohort.
    expect(sharedState.state!.removes).toHaveLength(
      SCHEDULED_BRANCH_STATS_COHORTS.length,
    );
    for (const r of sharedState.state!.removes) {
      expect(r.jobName).toBe(BRANCH_STATS_ROLLUP_QUEUE);
      expect(r.repeat.pattern).toBe(BRANCH_STATS_ROLLUP_CRON);
    }
  });
});
