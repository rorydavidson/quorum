# Quorum — Phase 11: Containerisation & Production Readiness

> Read CLAUDE.md first for architecture, types, and conventions.

**Scope:** Dockerfiles for BFF + Web, docker-compose with Postgres + Redis, dynamic DB client, Redis-backed sessions, Next.js standalone output. AWS IaC (Terraform/ECS) is a separate future phase.

---

## Context

The portal runs locally with in-memory sessions (lost on restart), SQLite (single-file, not suitable for multi-replica), and no container packaging. Production requires:

- **PostgreSQL** — durable, multi-connection-safe config/audit store
- **Redis** — session persistence across BFF restarts (and future replicas)
- **Docker images** — for BFF and Web, buildable from the monorepo root
- **docker-compose.yml** — single command to bring up the full stack locally or in CI

---

## New Dependencies

Must be added to `apps/bff/package.json` **before** implementation:

```bash
pnpm --filter bff add redis connect-redis pg
pnpm --filter bff add -D @types/pg
```

| Package | Reason |
|---|---|
| `redis` | Redis client (v4, native Promises) |
| `connect-redis` | express-session store backed by Redis |
| `pg` | Knex PostgreSQL driver |
| `@types/pg` | TypeScript types for pg |

---

## Code Changes

### 1. `apps/bff/src/services/db.ts`

**Problem:** Knex client is hardcoded to `better-sqlite3`. Production needs PostgreSQL.

Replace the top-level Knex instantiation (lines 8–14) with dynamic detection:

```typescript
const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db';
const isPostgres =
  databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://');

export const db = isPostgres
  ? Knex({ client: 'pg', connection: databaseUrl, pool: { min: 2, max: 10 } })
  : Knex({
      client: 'better-sqlite3',
      connection: { filename: databaseUrl.replace(/^file:/, '') },
      useNullAsDefault: true,
    });
```

- **Export `db`** — needed by `index.ts` for the health check (`db.raw('SELECT 1')`) and SIGTERM handler (`db.destroy()`).
- All migrations and query code are unchanged — Knex schema builder is DB-agnostic.

---

### 2. `apps/bff/src/index.ts`

Three additions:

**a) Redis session store**

```typescript
import { createClient } from 'redis';
import RedisStore from 'connect-redis';

async function buildSessionStore(): Promise<session.Store | undefined> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return undefined; // → MemoryStore (dev/test, no change to tests)
  const client = createClient({ url: redisUrl });
  client.on('error', (err) => console.error('[redis]', err));
  await client.connect();
  console.log('[redis] Connected');
  return new RedisStore({ client }) as session.Store;
}
```

Pass the store into `session({ store: await buildSessionStore(), ... })`. When `REDIS_URL` is unset the function returns `undefined` and express-session uses MemoryStore — all 229 existing tests continue to pass without any mocking.

**b) Improved `/health` endpoint** — verifies DB connectivity:

```typescript
app.get('/health', async (_req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok', service: 'bff', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', service: 'bff', timestamp: new Date().toISOString() });
  }
});
```

**c) SIGTERM handler** — graceful shutdown for ECS/Compose:

```typescript
const server = app.listen(PORT, () => {
  console.log(`BFF running on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[shutdown] SIGTERM — draining connections…');
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
});
```

---

### 3. `apps/web/next.config.ts`

Add standalone output mode (required for production Docker image):

```typescript
import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Trace workspace deps from the monorepo root so @snomed/types is included
  outputFileTracingRoot: path.join(__dirname, '../../'),
  serverRuntimeConfig: {
    bffUrl: process.env.BFF_URL ?? 'http://localhost:3001',
  },
  publicRuntimeConfig: {
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Quorum',
  },
};

export default nextConfig;
```

---

## Files to Create

### 4. `apps/bff/Dockerfile`

Multi-stage build. Builder installs native tools needed by `better-sqlite3`; uses `pnpm deploy` to create a self-contained production bundle that resolves workspace symlinks.

```dockerfile
# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /repo

# Native build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@latest --activate

# Layer-cache manifests separately
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/bff/package.json ./apps/bff/

RUN pnpm install --frozen-lockfile

COPY packages/types ./packages/types
COPY apps/bff ./apps/bff

RUN pnpm --filter types build
RUN pnpm --filter bff build

# Self-contained deployment bundle (resolves workspace symlinks)
RUN pnpm --filter bff deploy --prod /app/deploy

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S quorum && adduser -S quorum -G quorum

COPY --from=builder --chown=quorum:quorum /app/deploy ./

USER quorum
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
```

---

### 5. `apps/web/Dockerfile`

Multi-stage. Builds with `output: 'standalone'`; runner copies only the standalone output.

```dockerfile
# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/types ./packages/types
COPY apps/web ./apps/web

RUN pnpm --filter types build
RUN pnpm --filter web build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S quorum && adduser -S quorum -G quorum

# Standalone server (path is repo-root-relative because of outputFileTracingRoot)
COPY --from=builder --chown=quorum:quorum /repo/apps/web/.next/standalone ./
# Static assets alongside the server
COPY --from=builder --chown=quorum:quorum /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=quorum:quorum /repo/apps/web/public ./apps/web/public

USER quorum
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000 2>/dev/null | grep -q 'Quorum' || exit 1

# Standalone entry point path under monorepo layout
CMD ["node", "apps/web/server.js"]
```

---

### 6. `docker-compose.yml` (repo root)

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: quorum
      POSTGRES_USER: quorum
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-quorum_dev_only}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U quorum"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  bff:
    build:
      context: .
      dockerfile: apps/bff/Dockerfile
    restart: unless-stopped
    ports:
      - "3001:3001"
    env_file:
      - apps/bff/.env.docker
    environment:
      PORT: "3001"
      DATABASE_URL: postgresql://quorum:${POSTGRES_PASSWORD:-quorum_dev_only}@postgres:5432/quorum
      REDIS_URL: redis://redis:6379
      FRONTEND_ORIGIN: http://localhost:3000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - apps/web/.env.docker
    environment:
      BFF_URL: http://bff:3001
      NODE_ENV: production
    depends_on:
      - bff

volumes:
  postgres_data:
```

---

### 7. `apps/bff/.env.docker.example`

Template — copy to `.env.docker` and fill in secrets before `docker compose up`.

```env
# Keycloak
KEYCLOAK_URL=https://snoauth.ihtsdotools.org
KEYCLOAK_REALM=snomed
KEYCLOAK_CLIENT_ID=quorum
KEYCLOAK_CLIENT_SECRET=FILL_IN
KEYCLOAK_REDIRECT_URI=https://<your-bff-domain>/auth/callback

# Session
SESSION_SECRET=FILL_IN_32_CHAR_RANDOM_STRING
SESSION_COOKIE_NAME=quorum_session

# Google APIs
GOOGLE_SERVICE_ACCOUNT_EMAIL=quorum-drive-reader@<project>.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=<gcp-project-id>

# Discourse
DISCOURSE_URL=https://forums.snomed.org

# DATABASE_URL, REDIS_URL, PORT, FRONTEND_ORIGIN — set by docker-compose
```

---

### 8. `apps/web/.env.docker.example`

```env
NEXT_PUBLIC_APP_NAME=Quorum
DISCOURSE_URL=https://forums.snomed.org

# BFF_URL and NODE_ENV — set by docker-compose
```

---

### 9. `apps/bff/.dockerignore`

```
node_modules
dist
*.db
.env*
```

---

### 10. `apps/web/.dockerignore`

```
node_modules
.next
.env*
```

---

## Implementation Order

1. `pnpm --filter bff add redis connect-redis pg && pnpm --filter bff add -D @types/pg`
2. Modify `apps/bff/src/services/db.ts` — dynamic client + export `db`
3. Modify `apps/bff/src/index.ts` — Redis store, health check, SIGTERM handler
4. Modify `apps/web/next.config.ts` — `output: 'standalone'` + `outputFileTracingRoot`
5. Create `apps/bff/Dockerfile`
6. Create `apps/web/Dockerfile`
7. Create `docker-compose.yml`
8. Create `apps/bff/.dockerignore` and `apps/web/.dockerignore`
9. Create `apps/bff/.env.docker.example` and `apps/web/.env.docker.example`

---

## Verification

- [ ] `pnpm test` — all 229 BFF tests pass (Redis path is skipped when `REDIS_URL` unset → MemoryStore)
- [ ] `pnpm typecheck` — clean (new packages have types via `@types/pg` + bundled redis/connect-redis types)
- [ ] `docker compose build` — both images build without errors
- [ ] `docker compose up` — postgres healthy → redis healthy → BFF starts + migrates → web starts
- [ ] `curl http://localhost:3001/health` → `{"status":"ok",...}`
- [ ] `open http://localhost:3000` → landing page renders
- [ ] `docker compose restart bff` → session survives (Redis-backed)
- [ ] `docker compose stop bff` → BFF logs `[shutdown] SIGTERM — draining…`, exits cleanly without `SIGKILL` timeout
