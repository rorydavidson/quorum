import 'dotenv/config';
import express, { type Express } from 'express';
import cors from 'cors';
import session from 'express-session';

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

// Placeholder routes — implemented in Phase 2+
// app.use('/auth', authRouter);
// app.use('/documents', documentsRouter);
// app.use('/calendar', calendarRouter);
// app.use('/search', searchRouter);
// app.use('/admin', adminRouter);

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`BFF running on http://localhost:${PORT}`);
});

export default app;
