import { describe, it, expect } from "vitest";
import {
  globalLimiter,
  authLimiter,
  searchLimiter,
  uploadLimiter,
  closeRateLimiterRedis,
} from "./rateLimiter.js";

describe("rateLimiter", () => {
  it("exports the four limiter middlewares", () => {
    for (const limiter of [globalLimiter, authLimiter, searchLimiter, uploadLimiter]) {
      expect(typeof limiter).toBe("function");
    }
  });

  it("closeRateLimiterRedis resolves when no Redis client is active (test env)", async () => {
    // In tests REDIS_URL is unset, so no client is ever created — closing is a no-op.
    await expect(closeRateLimiterRedis()).resolves.toBeUndefined();
  });
});
