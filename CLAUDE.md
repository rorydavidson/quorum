# Quorum — A Governance Portal — CLAUDE.md

> This file is the authoritative project blueprint. Read it at the start of every session.
> Keep it in step with the code: when the stack, a rule or a convention changes, change it here in the same PR.

---

## Project Overview

A bespoke governance portal, built primarily for **SNOMED International** but applicable to any organisation with different governance bodies, replacing Atlassian Confluence.
Primary goal: a clean, professional, **iPadOS-accessible** interface for board members to access agendas, documents, and calendars — driven by Keycloak SSO and Google Drive.

**Key pain points being solved:**
- Confluence is broken/degraded on iPadOS (primary board device)
- Confluence's wiki UX is inappropriate for governance/board contexts
- No unified search across documents, meetings, and archives
- No clean RBAC tied to existing Keycloak groups

---

## Hard Rules
- Never install a new dependency without asking first
- Always produce unit tests wherever applicable
- Always consider performance and volume impact so the app can scale if necessary
- Environment variables go in `.env.local`, never hardcoded
- Node **20 LTS** for local development and CI. `better-sqlite3` has no prebuilt binary for newer Node majors, so the BFF and the DB-layer tests will not run on Node 22+ without a working toolchain.

## Patterns
- Use server components by default, client components only when interactivity is required
- Error boundaries on every route segment
- Privacy-first design leaning on other services to hold key private data

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 15.5 (App Router), React 19 | `output: 'standalone'`; middleware gates every portal route |
| BFF | Node.js 20 + Express 4 | Proxies Keycloak tokens & Google APIs server-side |
| Auth | Keycloak OIDC via `openid-client` | Existing SNOMED SSO (`snoauth.ihtsdotools.org`) |
| Sessions | `express-session`, PostgreSQL store in prod (`connect-pg-simple`) | In-memory in dev; 8h cookie |
| Drive integration | Google Drive API (Service Account) | Read/list/upload/proxy documents; polling sweep for files added directly in Drive |
| Calendar | Google Calendar API or public iCal feeds (`node-ical`) | Upcoming meetings per space |
| Forum | Discourse public API (forums.snomed.org) | Recent topics per space, no auth required |
| Search | Google Drive search API | Unified search over accessible spaces plus calendar events |
| DB | SQLite (dev / tests) or PostgreSQL (prod) via Knex | Admin config, audit log, read receipts, subscriptions, sweep state, anonymous usage counts |
| Rate limiting | `express-rate-limit`, Redis store when `REDIS_URL` is set | Keeps limits consistent across BFF instances |
| Email | `nodemailer` | "Notify me" subscriptions; logs instead of sending when SMTP is unset |
| Validation | Zod | All BFF write bodies |
| Logging | pino + pino-http | Per-request correlation id |
| PDF Viewer | react-pdf (PDF.js) | In-portal viewer, avoids iPadOS app redirects |
| Styling | Tailwind CSS with hand-rolled components | No component library. shadcn/ui is **not** used. |
| Icons | lucide-react | |
| Package manager | pnpm workspace | `apps/web`, `apps/bff`, `packages/types` |
| Hosting | Docker (nginx + web + bff + postgres + redis) via `docker-compose*.yml`, or systemd units under `deploy/` | CI pushes images to Docker Hub on `main`, `develop` and `v*` tags |

`@tanstack/react-query` is in `apps/web/package.json` but currently unused.

---

## Repository Map

```
apps/web/
  middleware.ts                 session check against BFF /auth/session; injects x-quorum-user
  app/(portal)/...              server components per route (dashboard, spaces, search, admin)
  app/api/[...path]/route.ts    generic BFF proxy (see lib/proxy.ts) — every /api/* except auth
  app/api/auth/[...route]/      auth proxy: forwards redirects + Set-Cookie
  lib/proxy.ts                  proxyToBff() + PROXIED_PREFIXES allowlist
  lib/auth.ts                   getUser()/isAdmin() from the middleware header
  lib/csrf.ts                   csrfFetch(): fetches /api/csrf-token, retries once on 403
  components/admin/             AdminShell + one component per admin view
apps/bff/src/
  index.ts                      app wiring, session, CSRF, rate limits, health, errorHandler
  routes/                       one router per prefix; all handlers wrapped in asyncHandler
  middleware/                   requireAuth, requireAdmin, csrf, rateLimiter, asyncHandler, errorHandler
  services/db.ts                barrel over services/db/* (client, migrations, spaces, events, backup,
                                audit, categories, reads, notifications, sweep, metrics)
  services/drive.ts             Drive client, caches, folder/file ancestry verification
  services/calendar.ts          SA → iCal tiers; sample events only with CALENDAR_MOCK=true
  services/keycloak.ts          discovery, code exchange, ID/access token claim parsing
  utils/rbac.ts                 isAdminUser, userCanAccessSpace, userCanUpload
  utils/validation.ts           zodError, shared Zod schemas
packages/types/                 shared TypeScript types (@snomed/types)
e2e/                            Playwright: chromium + iPad Pro 11 emulation
deploy/                         nginx configs, systemd units, docker env examples
```

---

## Development Commands

```bash
pnpm install                 # install all workspace dependencies
pnpm --filter web dev        # Next.js on http://localhost:3000
pnpm --filter bff dev        # BFF on http://localhost:3001
pnpm dev                     # build then run both concurrently
pnpm typecheck               # all packages
pnpm lint                    # all packages
pnpm test                    # BFF + web unit tests (vitest)
pnpm test:e2e                # Playwright (boots both apps with DEV_AUTH_BYPASS + mock mode)
pnpm build                   # production build of all packages
```

Local dev without external services: unset the Google Service Account vars (Drive serves sample files), set `DEV_AUTH_BYPASS=true` in both apps, leave SMTP unset. `DISCOURSE_MOCK=true` and `CALENDAR_MOCK=true` opt into sample forum topics and sample meetings respectively.

---

## Design System

### Brand Colours (Tailwind tokens in `apps/web/tailwind.config.ts`)

```
snomed-blue        #009FE3   primary actions, nav accent
snomed-blue-dark   #0080C0   hover state for primary buttons
snomed-blue-light  #E6F6FC   tinted backgrounds, badges
snomed-grey        #4D5057   body text
snomed-grey-light  #F5F6F7   page background
snomed-border      #E2E4E7   separators
Danger             Tailwind red-600 / red-50 for destructive actions and errors
```

Use these token names. `snomed-dark-blue` does not exist and silently does nothing.

### Typography

- Font: `Google Sans` (Google Fonts), falling back to `Inter` / `system-ui`
- Headings: `font-semibold`, scale `text-2xl` → `text-sm`
- Body: `text-base` / `text-sm`, colour `snomed-grey`

### Component Conventions

- **Touch targets:** minimum 44×44px on all interactive elements (iOS HIG). `globals.css` applies `min-h-[44px]` to buttons by default; do not override it with smaller fixed sizes.
- **No hover-only states:** every interaction must work on touch. `group-hover` reveals are not acceptable as the only path.
- **Cards:** white background, 1px `snomed-border`, `rounded-xl`, `shadow-sm`
- **Sidebar:** collapsible drawer below `lg`; tab bar on mobile (<768px)
- **Modals:** full-screen on mobile; centred overlay (max-w-4xl) on desktop
- **PDF Viewer:** full-screen modal with toolbar (page nav, zoom, download)
- **Confirmations:** `window.confirm` is used today for destructive admin actions. Prefer an in-app dialog for anything new.

---

## Security Rules

> These rules must be followed in every implementation session.

1. **Keycloak tokens NEVER reach the browser.** BFF only.
2. **Google Service Account credentials NEVER in frontend env vars.** `apps/bff/.env.local` only.
3. **All BFF routes require `requireAuth` middleware** except `/auth/login`, `/auth/callback`, `/auth/session`, `/health`, `/csrf-token`.
4. **Admin routes require both `requireAuth` AND `requireAdmin` middleware.**
5. **File downloads proxied through BFF** — never issue pre-signed URLs with long expiry to the browser.
6. **Session cookies:** `httpOnly: true`, `secure: true` (prod), `sameSite: 'lax'`.
7. **RBAC enforced server-side:** group membership from the Keycloak ID token, not client-supplied. Reading a space needs its `keycloakGroup`; writing (uploads, folders, event agendas) needs one of its `uploadGroups` or `portal_admin`.
8. **Input validation:** every BFF write body is validated with Zod before any DB write, including `/admin/import`. URLs the server will fetch (`icalUrl`) must be https; URLs the browser will render as links must be http(s).
9. **No CORS wildcards:** BFF CORS origin locked to `FRONTEND_ORIGIN`.
10. **No sensitive data in Next.js `NEXT_PUBLIC_` env vars.**
11. **CSRF tokens required** on POST/PUT/DELETE to `/documents`, `/admin`, `/events`, `/notifications`, and on `POST /auth/logout` (logout is never a GET). Frontend uses `csrfFetch()` from `lib/csrf.ts`, which fetches `GET /csrf-token` and sends it as `x-csrf-token`.
12. **Rate limiting** applied globally (100 req/min) and per-endpoint (auth 30/min, search 20/min, upload 10/min).
13. **Folder ancestry verification:** user-supplied `folderId` / `fileId` params are verified against the space's Drive folder tree (`verifyFolderAncestry` / `verifyFileAncestry`) before use. Never call Drive with an unverified id.
14. **Per-space scoping in the DB:** rows that belong to a space (event metadata, sections, reads) are always queried with the space id, never by their own id alone.
15. **The `x-quorum-user` header is trusted only because middleware sets it.** nginx strips it from inbound requests; keep that in any new reverse-proxy config.
16. **The web API proxy is an allowlist.** A new BFF prefix must be added to `PROXIED_PREFIXES` in `lib/proxy.ts` before the browser can reach it.
17. **5xx responses never carry `err.message`.** The global `errorHandler` logs the full error and returns a generic message with the error `code`.
18. **No sample data in production.** Mock Drive files appear only without Service Account credentials; mock calendar events only with `CALENDAR_MOCK=true`; mock forum topics only with `DISCOURSE_MOCK=true`. `DEV_AUTH_BYPASS` is ignored when `NODE_ENV=production`.
19. **The web container is isolated.** In `docker-compose.yml` it sits on the internal `app` network only (nginx + BFF), with a read-only root filesystem, `cap_drop: ALL` and `no-new-privileges`. Never attach it to `data` or `public`, and never give it secrets: everything sensitive belongs to the BFF.

---

## Testing Strategy

- **BFF unit / route tests:** `vitest` + `supertest` with mocked Google, DB and SMTP (`apps/bff/src/**/*.test.ts`). Route tests assert status codes and error `code`s, not just that a mock was called.
- **BFF DB layer:** `services/db.test.ts` runs against in-memory SQLite locally and, in CI, a second time against `postgres:16` (`TEST_DATABASE_URL`). Anything using RETURNING, ON CONFLICT or timestamps needs a case here.
- **Drive ancestry:** `services/drive.ancestry.test.ts` walks a fake Drive tree through mocked `googleapis`.
- **Web component tests:** `@testing-library/react` under `apps/web/components/**` and `apps/web/lib/**` (AdminShell, DocumentList, proxy, csrf, and others).
- **E2E:** Playwright in `e2e/` — desktop Chromium plus an `iPad Pro 11` emulation project for the smoke suite. Boots both apps with `DEV_AUTH_BYPASS` and mock mode.
- CI runs typecheck, lint, unit, E2E and the Postgres DB job on every push; Docker images build only on `main`, `develop` and `v*` tags.

---

## Key Conventions for Claude Sessions

- Always run `pnpm typecheck`, `pnpm lint` and `pnpm test` before considering a task complete. If `db.test.ts` cannot load `better-sqlite3` locally, say so and rely on CI rather than skipping silently.
- Prefer server components in the App Router; use `'use client'` only when needed (event handlers, state, browser APIs).
- **Every async Express handler is wrapped in `asyncHandler`.** Bare `async (req, res) =>` handlers hang the request on rejection.
- BFF routes follow REST conventions: `GET /documents/:spaceId`, `GET /documents/:spaceId/:fileId/download`.
- Error responses from the BFF: `{ error: string, code: string }` with an appropriate HTTP status. Add new `code`s as UPPER_SNAKE_CASE.
- Shared Zod schemas and `zodError` live in `apps/bff/src/utils/validation.ts`; do not copy them into a route file.
- New DB access goes in the matching `apps/bff/src/services/db/<domain>.ts` and is re-exported from `services/db.ts`. Tests mock `../services/db.js`, so keep that import path.
- New browser-facing BFF endpoints need no new Next route file: add the prefix to `PROXIED_PREFIXES` and call `/api/<prefix>/...` from the client.
- Admin UI: one component per view under `components/admin/`, each rendering `AdminHeader` with its own actions. Use `useToast` for feedback.
- All dates in ISO 8601 over the wire. Display formatting happens in the frontend only. Note SQLite returns `YYYY-MM-DD HH:MM:SS` without a zone; normalise before parsing.
- Commit messages: conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`), imperative mood, one concern per commit. Never commit directly to `main`.
