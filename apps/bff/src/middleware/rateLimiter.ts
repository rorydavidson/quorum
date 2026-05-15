import rateLimit from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: envInt("RATE_LIMIT_GLOBAL", 100),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many requests, please try again later", code: "RATE_LIMITED" },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: envInt("RATE_LIMIT_AUTH", 30),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many authentication attempts", code: "AUTH_RATE_LIMITED" },
});

export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: envInt("RATE_LIMIT_SEARCH", 20),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many search requests", code: "SEARCH_RATE_LIMITED" },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: envInt("RATE_LIMIT_UPLOAD", 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many upload requests", code: "UPLOAD_RATE_LIMITED" },
});
