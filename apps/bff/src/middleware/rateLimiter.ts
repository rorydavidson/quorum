import rateLimit, { type Store } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import Redis from "ioredis";

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ---------------------------------------------------------------------------
// Redis-backed store.
//
// The default express-rate-limit store is in-memory and per-process, so across
// multiple ECS tasks the effective limit becomes N× the intended value and
// resets on every deploy. When REDIS_URL is set we share counters through Redis
// so limits hold cluster-wide. Without REDIS_URL we fall back to the in-memory
// store (fine for local dev / single instance / tests).
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (isTest || !process.env.REDIS_URL) return null;
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL, {
      // Rate limiting must not queue commands forever if Redis is unreachable;
      // fail fast and let express-rate-limit surface errors rather than hang.
      maxRetriesPerRequest: 3,
    });
    _redis.on("error", (err) =>
      console.error("[rate-limit] Redis error:", err.message),
    );
    console.log("[rate-limit] Using Redis-backed store");
  }
  return _redis;
}

function makeStore(prefix: string): Store | undefined {
  const client = getRedis();
  if (!client) return undefined; // in-memory fallback
  return new RedisStore({
    // ioredis: forward raw commands to Redis. ioredis types `call` as returning
    // Promise<unknown>; cast to the reply shape express-rate-limit expects.
    sendCommand: (...args: string[]): Promise<RedisReply> =>
      client.call(args[0], ...args.slice(1)) as Promise<RedisReply>,
    prefix,
  }) as unknown as Store;
}

/** Closes the shared Redis connection (called during graceful shutdown). */
export async function closeRateLimiterRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: envInt("RATE_LIMIT_GLOBAL", 100),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  store: makeStore("rl:global:"),
  message: { error: "Too many requests, please try again later", code: "RATE_LIMITED" },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: envInt("RATE_LIMIT_AUTH", 30),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  store: makeStore("rl:auth:"),
  message: { error: "Too many authentication attempts", code: "AUTH_RATE_LIMITED" },
});

export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: envInt("RATE_LIMIT_SEARCH", 20),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  store: makeStore("rl:search:"),
  message: { error: "Too many search requests", code: "SEARCH_RATE_LIMITED" },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: envInt("RATE_LIMIT_UPLOAD", 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  store: makeStore("rl:upload:"),
  message: { error: "Too many upload requests", code: "UPLOAD_RATE_LIMITED" },
});
