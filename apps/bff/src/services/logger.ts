import pino, { type Logger } from "pino";
import type { Request } from "express";

// ---------------------------------------------------------------------------
// Structured JSON logger (pino).
//
// Emits newline-delimited JSON so logs are queryable in CloudWatch / any log
// aggregator. Level is a string ("error"), time is ISO 8601, and a `service`
// field is stamped on every line. Sensitive request headers are redacted.
//
// LOG_LEVEL overrides the default (debug in dev, info in prod). Tests run
// silent to keep output clean.
// ---------------------------------------------------------------------------

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

const level =
  process.env.LOG_LEVEL ??
  (isTest ? "silent" : process.env.NODE_ENV === "production" ? "info" : "debug");

export const logger: Logger = pino({
  level,
  base: { service: "bff" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    // Log the level name ("error") rather than pino's default numeric code.
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      "req.headers.cookie",
      'req.headers["x-csrf-token"]',
      "req.headers.authorization",
      'res.headers["set-cookie"]',
    ],
    remove: true,
  },
});

/**
 * Returns the request-scoped child logger (attached by pino-http, carrying the
 * request id for correlation), falling back to the base logger in contexts
 * without the HTTP middleware — e.g. unit tests that mount a router directly.
 */
export function reqLog(req: Request): Logger {
  return (req as unknown as { log?: Logger }).log ?? logger;
}
