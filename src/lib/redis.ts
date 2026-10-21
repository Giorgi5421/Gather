import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };
export const redis = process.env.REDIS_URL
  ? globalForRedis.redis ?? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true, enableOfflineQueue: false })
  : null;

if (redis && process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export async function cachedJson<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  if (!redis) return load();
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
    const value = await load();
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    return value;
  } catch (error) {
    console.warn("Redis cache unavailable; serving from PostgreSQL", error);
    return load();
  }
}

export async function invalidateFeeds() {
  if (!redis) return;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", "gather:feed:*", "COUNT", 250);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
  } catch (error) {
    console.warn("Could not invalidate cached feeds", error);
  }
}
