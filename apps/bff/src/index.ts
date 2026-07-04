import { config as dotenvConfig } from "dotenv";
// Load .env.local first (dev overrides), then .env as fallback
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });
import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import helmet from "helmet";
import connectPgSimple from "connect-pg-simple";
import { initKeycloak } from "./services/keycloak.js";
import { checkDriveAccess } from "./services/drive.js";
import db, { runMigrations, isPostgresDb } from "./services/db.js";
import authRouter from "./routes/auth.js";
import documentsRouter from "./routes/documents.js";
import adminRouter from "./routes/admin.js";
import calendarRouter from "./routes/calendar.js";
import searchRouter from "./routes/search.js";
import eventsRouter from "./routes/events.js";
import forumRouter from "./routes/forum.js";
import notificationsRouter from "./routes/notifications.js";
import metricsRouter from "./routes/metrics.js";
import { globalLimiter, authLimiter, searchLimiter, closeRateLimiterRedis } from "./middleware/rateLimiter.js";
import { csrfToken, csrfProtection } from "./middleware/csrf.js";
import { logger, reqLog } from "./services/logger.js";
import { httpLogger } from "./middleware/httpLogger.js";

// ---------------------------------------------------------------------------
// Environment validation — fail fast before binding any port
// ---------------------------------------------------------------------------

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  logger.fatal(
    "SESSION_SECRET is not set. Generate one with: " +
      "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
  );
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  logger.fatal(
    { length: SESSION_SECRET.length },
    "SESSION_SECRET is too short — minimum 32 characters required",
  );
  process.exit(1);
}

const app: Express = express();
const PORT = process.env.PORT ?? 3001;

// Trust the first reverse proxy (nginx / ALB) so that req.protocol and
// req.ip reflect the original client request, not the proxy-to-container hop.
app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Structured request logging + per-request correlation id (must run first so
// every request — including those rejected downstream — is logged).
app.use(httpLogger);

// Security headers (helmet sets X-Frame-Options, HSTS, CSP, etc.)
app.use(helmet());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  }),
);

// Build session store: PostgreSQL-backed in production, in-memory in dev
function buildSessionStore(): session.Store | undefined {
  if (!isPostgresDb) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[startup] WARNING: No PostgreSQL DATABASE_URL configured — using in-memory session store. " +
          "Sessions will be lost on restart and cannot scale across instances.",
      );
    }
    return undefined;
  }
  const PgStore = connectPgSimple(session);
  return new PgStore({
    conString: process.env.DATABASE_URL,
    tableName: "user_sessions",
    createTableIfMissing: true,
    pruneSessionInterval: 600, // prune expired rows every 10 minutes
    ttl: 8 * 60 * 60, // 8 hours, matches cookie maxAge
  });
}

app.use(
  session({
    store: buildSessionStore(),
    name: process.env.SESSION_COOKIE_NAME ?? "quorum_session",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // COOKIE_SECURE overrides the default (production = secure).
      // Set COOKIE_SECURE=false when running production behind HTTP-only
      // (e.g. Docker without TLS). Browsers reject Secure cookies over HTTP.
      secure:
        process.env.COOKIE_SECURE !== undefined
          ? process.env.COOKIE_SECURE === "true"
          : process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  }),
);

// ---------------------------------------------------------------------------
// CSRF protection — initialise token in session, verify on state-changing routes
// ---------------------------------------------------------------------------

app.use(csrfToken);

app.get("/csrf-token", (req, res) => {
  res.json({ token: req.session._csrfSecret });
});

app.use("/documents", csrfProtection);
app.use("/admin", csrfProtection);
app.use("/events", csrfProtection);
app.use("/notifications", csrfProtection);

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

app.use(globalLimiter);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/health", async (_req, res) => {
  // The DB is the hard dependency: if it's down we're not ready (503).
  // Drive reachability is reported as a diagnostic but does not fail the probe —
  // individual document routes already degrade to 502 on Drive errors, and in
  // dev/mock mode Drive is intentionally unconfigured.
  try {
    await db.raw("SELECT 1");
  } catch (err) {
    logger.error({ err }, "Health check: database unreachable");
    res.status(503).json({
      status: "error",
      service: "bff",
      error: "Database unreachable",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const driveOk = await checkDriveAccess().catch(() => false);
  res.json({
    status: "ok",
    service: "bff",
    dependencies: {
      database: "ok",
      drive: driveOk ? "ok" : "unavailable",
    },
    timestamp: new Date().toISOString(),
  });
});

app.use("/auth", authLimiter, authRouter);
app.use("/documents", documentsRouter);
app.use("/admin", adminRouter);
app.use("/calendar", calendarRouter);
app.use("/search", searchLimiter, searchRouter);
app.use("/events", eventsRouter);
app.use("/forum", forumRouter);
app.use("/notifications", notificationsRouter);
// Page-view beacon — not under CSRF so it can use navigator.sendBeacon; the
// worst a forged request can do is inflate the caller's own view count.
app.use("/metrics", metricsRouter);

// ---------------------------------------------------------------------------
// Global Error Handler
// ---------------------------------------------------------------------------

interface AppError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
}

app.use(
  (
    err: AppError,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status = err.status || err.statusCode || 500;
    reqLog(req).error({ err, status, code: err.code }, "Unhandled request error");
    res.status(status).json({
      error: err.message || "Internal Server Error",
      code: err.code || "INTERNAL_ERROR",
    });
  },
);

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
});

// ---------------------------------------------------------------------------
// Start — initialise Keycloak before accepting traffic
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  try {
    await initKeycloak();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "Keycloak discovery failed — running without auth (check env vars)",
    );
  }

  try {
    await runMigrations();
  } catch (err) {
    logger.fatal({ err }, "DB migration failed");
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, `BFF running on http://localhost:${PORT}`);
  });

  // ---------------------------------------------------------------------------
  // Graceful shutdown — handles systemd SIGTERM and Ctrl+C (SIGINT)
  // ---------------------------------------------------------------------------

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received — draining connections");
    server.close(async () => {
      try {
        await closeRateLimiterRedis();
        await db.destroy();
        logger.info("DB & Redis connections closed — exiting");
      } catch (err) {
        logger.error({ err }, "Error closing connections during shutdown");
      }
      process.exit(0);
    });

    // Force exit after 30 seconds if connections don't drain
    setTimeout(() => {
      logger.error("Forced exit after 30s shutdown timeout");
      process.exit(1);
    }, 30_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();

export default app;
