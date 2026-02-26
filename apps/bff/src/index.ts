import { config as dotenvConfig } from 'dotenv';
// Load .env.local first (dev overrides), then .env as fallback
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
import express, { type Express } from 'express';
import cors from 'cors';
import session from 'express-session';
import { initKeycloak } from './services/keycloak.js';
import { runMigrations } from './services/db.js';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import adminRouter from './routes/admin.js';

const app: Express = express();
const PORT = process.env.PORT ?? 3001;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  })
);

app.use(
  session({
    name: process.env.SESSION_COOKIE_NAME ?? 'quorum_session',
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  })
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bff', timestamp: new Date().toISOString() });
});

app.use('/auth', authRouter);
app.use('/documents', documentsRouter);
app.use('/admin', adminRouter);

// Placeholder routes — implemented in future phases
// app.use('/calendar', calendarRouter);
// app.use('/search', searchRouter);

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// ---------------------------------------------------------------------------
// Start — initialise Keycloak before accepting traffic
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  try {
    await initKeycloak();
  } catch (err) {
    console.warn('[startup] Keycloak discovery failed — running without auth (check env vars):', (err as Error).message);
  }

  try {
    await runMigrations();
  } catch (err) {
    console.error('[startup] DB migration failed:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`BFF running on http://localhost:${PORT}`);
  });
}

start();

export default app;
