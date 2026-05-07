export interface RedisConnectionOptions {
  url: string;
  /** Required for BullMQ Workers. */
  maxRetriesPerRequest: null;
}

let cached: RedisConnectionOptions | null = null;

export function getRedisConnection(): RedisConnectionOptions {
  if (cached) return cached;
  cached = {
    url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    maxRetriesPerRequest: null,
  };
  return cached;
}

export function _resetRedisForTests(): void {
  cached = null;
}
