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
import db, { runMigrations, isPostgresDb } from "./services/db.js";
import authRouter from "./routes/auth.js";
import documentsRouter from "./routes/documents.js";
import adminRouter from "./routes/admin.js";
import calendarRouter from "./routes/calendar.js";
import searchRouter from "./routes/search.js";
import eventsRouter from "./routes/events.js";
import forumRouter from "./routes/forum.js";

// ---------------------------------------------------------------------------
// Environment validation — fail fast before binding any port
// ---------------------------------------------------------------------------

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error(
    "[startup] FATAL: SESSION_SECRET is not set. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
  );
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  console.error(
    `[startup] FATAL: SESSION_SECRET is too short (${SESSION_SECRET.length} chars). Minimum 32 characters required.`,
  );
  process.exit(1);
}

const app: Express = express();
const PORT = process.env.PORT ?? 3001;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

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
  if (!isPostgresDb) return undefined; // dev: express-session MemoryStore
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
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  }),
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/health", async (_req, res) => {
  try {
    await db.raw("SELECT 1");
    res.json({
      status: "ok",
      service: "bff",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[health] DB check failed:", err);
    res.status(503).json({
      status: "error",
      service: "bff",
      error: "Database unreachable",
      timestamp: new Date().toISOString(),
    });
  }
});

app.use("/auth", authRouter);
app.use("/documents", documentsRouter);
app.use("/admin", adminRouter);
app.use("/calendar", calendarRouter);
app.use("/search", searchRouter);
app.use("/events", eventsRouter);
app.use("/forum", forumRouter);

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
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[BFF Error]", err);
    const status = err.status || err.statusCode || 500;
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
    console.warn(
      "[startup] Keycloak discovery failed — running without auth (check env vars):",
      (err as Error).message,
    );
  }

  try {
    await runMigrations();
  } catch (err) {
    console.error("[startup] DB migration failed:", err);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`BFF running on http://localhost:${PORT}`);
  });

  // ---------------------------------------------------------------------------
  // Graceful shutdown — handles systemd SIGTERM and Ctrl+C (SIGINT)
  // ---------------------------------------------------------------------------

  const shutdown = async (signal: string) => {
    console.log(`[shutdown] ${signal} received — draining connections...`);
    server.close(async () => {
      try {
        await db.destroy();
        console.log("[shutdown] DB connections closed. Exiting.");
      } catch (err) {
        console.error("[shutdown] Error closing DB:", err);
      }
      process.exit(0);
    });

    // Force exit after 30 seconds if connections don't drain
    setTimeout(() => {
      console.error("[shutdown] Forced exit after 30s timeout");
      process.exit(1);
    }, 30_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();

export default app;
