import { config as dotenvConfig } from "dotenv";
// Load .env.local first (dev overrides), then .env as fallback
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });
import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import helmet from "helmet";
import { initKeycloak } from "./services/keycloak.js";
import { runMigrations } from "./services/db.js";
import authRouter from "./routes/auth.js";
import documentsRouter from "./routes/documents.js";
import adminRouter from "./routes/admin.js";
import calendarRouter from "./routes/calendar.js";
import searchRouter from "./routes/search.js";
import eventsRouter from "./routes/events.js";

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

app.use(
  session({
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

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "bff",
    timestamp: new Date().toISOString(),
  });
});

app.use("/auth", authRouter);
app.use("/documents", documentsRouter);
app.use("/admin", adminRouter);
app.use("/calendar", calendarRouter);
app.use("/search", searchRouter);
app.use("/events", eventsRouter);

// ---------------------------------------------------------------------------
// Global Error Handler
// ---------------------------------------------------------------------------

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[BFF Error]", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || "Internal Server Error",
    code: err.code || "INTERNAL_ERROR",
  });
});

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

  app.listen(PORT, () => {
    console.log(`BFF running on http://localhost:${PORT}`);
  });
}

start();

export default app;
