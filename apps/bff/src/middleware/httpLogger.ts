import { pinoHttp } from "pino-http";
import { randomUUID } from "crypto";
import { logger } from "../services/logger.js";

// ---------------------------------------------------------------------------
// Per-request logging.
//
// Assigns each request a correlation id (honouring an inbound x-request-id if
// present, else a fresh UUID), echoes it back in the response header, and
// attaches a child logger as `req.log` so downstream handlers can log with the
// id folded in. Emits one completion line per request with method, path,
// status and duration. Health checks are skipped to keep the feed quiet.
// ---------------------------------------------------------------------------

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const inbound = req.headers["x-request-id"];
    const id = (Array.isArray(inbound) ? inbound[0] : inbound) ?? randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  autoLogging: {
    ignore: (req) => req.url === "/health",
  },
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
