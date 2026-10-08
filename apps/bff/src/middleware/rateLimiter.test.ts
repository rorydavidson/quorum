import { describe, it, expect } from "vitest";
import type { Request } from "express";
import {
  rateLimitKey,
  isRateLimitExempt,
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

  describe("rateLimitKey", () => {
    const req = (fields: Record<string, unknown>) => fields as unknown as Request;

    it("keys signed-in users on their id, not the proxy IP", () => {
      const a = rateLimitKey(req({ ip: "10.0.0.5", session: { user: { sub: "alice" } } }));
      const b = rateLimitKey(req({ ip: "10.0.0.5", session: { user: { sub: "bob" } } }));
      expect(a).toBe("user:alice");
      expect(b).toBe("user:bob");
    });

    it("falls back to IP for anonymous requests", () => {
      expect(rateLimitKey(req({ ip: "203.0.113.7", session: {} }))).toBe("ip:203.0.113.7");
      expect(rateLimitKey(req({ ip: "203.0.113.7" }))).toBe("ip:203.0.113.7");
    });

    it("groups IPv6 clients by subnet so one host cannot rotate addresses", () => {
      const a = rateLimitKey(req({ ip: "2001:db8:1:1::1" }));
      const b = rateLimitKey(req({ ip: "2001:db8:1:1::2" }));
      expect(a).toBe(b);
    });
  });

  describe("isRateLimitExempt", () => {
    const req = (baseUrl: string, path: string) => ({ baseUrl, path }) as unknown as Request;

    it("exempts the session check and login redirect wherever the limiter is mounted", () => {
      expect(isRateLimitExempt(req("", "/auth/session"))).toBe(true);
      expect(isRateLimitExempt(req("/auth", "/session"))).toBe(true);
      expect(isRateLimitExempt(req("/auth", "/login"))).toBe(true);
    });

    it("still limits the token-handling auth routes and everything else", () => {
      expect(isRateLimitExempt(req("/auth", "/callback"))).toBe(false);
      expect(isRateLimitExempt(req("/auth", "/refresh"))).toBe(false);
      expect(isRateLimitExempt(req("", "/search"))).toBe(false);
      expect(isRateLimitExempt(req("", "/auth/sessionx"))).toBe(false);
    });
  });
});
