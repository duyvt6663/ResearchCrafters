// Producer-side helper for the worker queues.
//
// The web app's admin trigger routes need to enqueue one-shot jobs without
// pulling in the consumer-side `Worker`. This module exposes a tiny
// `getProducerQueue(name)` that returns a process-scoped, memoised BullMQ
// `Queue` bound to the same `getRedisConnection()` the worker uses. Re-using
// a single Queue per name avoids leaking redis sockets across requests.

import { type QueueName } from './queues.js';
import { getRedisConnection } from './redis.js';

/**
 * Minimal Queue-shape we expose to producer call sites. Using a structural
 * interface here (rather than re-exporting `bullmq.Queue` directly) keeps the
 * web app from needing bullmq's strict type imports under `NodeNext` ESM,
 * which currently mis-resolves a couple of bullmq sub-paths.
 */
export interface ProducerQueue {
  name: string;
  add(
    jobName: string,
    payload: unknown,
    opts?: { jobId?: string },
  ): Promise<{ id?: string | null }>;
  close(): Promise<unknown>;
}

const cache = new Map<QueueName, Promise<ProducerQueue>>();

async function buildQueue(name: QueueName): Promise<ProducerQueue> {
  const redis = getRedisConnection();
  const bullmq = (await import('bullmq')) as {
    Queue: new (
      name: string,
      opts: { connection: { url: string; maxRetriesPerRequest: null } },
    ) => ProducerQueue;
  };
  return new bullmq.Queue(name, {
    connection: {
      url: redis.url,
      maxRetriesPerRequest: redis.maxRetriesPerRequest,
    },
  });
}

/**
 * Return a process-shared producer Queue for `name`. The first call constructs
 * the Queue (and the underlying ioredis connection); subsequent calls reuse
 * it. Callers MUST NOT close the returned queue — it lives for the lifetime
 * of the Node process.
 */
export function getProducerQueue(name: QueueName): Promise<ProducerQueue> {
  let cached = cache.get(name);
  if (!cached) {
    cached = buildQueue(name);
    cache.set(name, cached);
  }
  return cached;
}

/**
 * Test seam: dispose any cached producer queues. Production code should never
 * call this — it exists so unit tests can swap implementations between cases.
 */
export async function _resetProducerQueuesForTests(): Promise<void> {
  const queues = Array.from(cache.values());
  cache.clear();
  await Promise.all(
    queues.map(async (p) => {
      try {
        const q = await p;
        await q.close();
      } catch {
        /* ignore */
      }
    }),
  );
}

/** Test seam: pre-populate the cache with a fake queue. */
export function _setProducerQueueForTests(
  name: QueueName,
  queue: ProducerQueue,
): void {
  cache.set(name, Promise.resolve(queue));
}
