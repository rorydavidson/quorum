# Quorum — Online Governance Portal

A bespoke governance portal replacing use of services like Atlassian Confluence for an organisation's governance bodies. Built for multiple devices with a nod to iPad use, with Keycloak SSO, Google Drive document surfacing, role-based access control, and a full audit trail.

---

## Features

- **Public landing page** with SSO sign-in button
- **Keycloak OIDC authentication** — full authorization code flow, httpOnly session cookie, group-based RBAC
- **Document spaces** — each governance group gets a space backed by a Google Drive folder; supports nested sections (e.g. Agendas, Minutes, Board Papers)
- **Contextual space sidebar** — when inside a space, a secondary sidebar shows overview, document sections, and calendar links
- **Event Management** — dedicated pages for calendar events with linked meeting documents and interactive agenda items (with "Responsible" assignments and status tracking)
- **File upload** — authorised users (per-space upload groups) can upload documents directly to the Drive folder from the portal
- **In-portal PDF viewer** — view PDFs and Google Docs (exported as PDF) without leaving the browser; avoids iOS redirecting to external apps and bypasses Google Drive firewall restrictions for restricted users
- **Calendar integration** — upcoming meetings per space via Google Calendar API or iCal URL
- **Forum discussions** — recent Discourse topics per space, surfaced inline from `forums.snomed.org` (configurable per environment via `DISCOURSE_URL`); graceful degradation if the forum is unreachable
- **Unified search** — full-text search across Drive documents, calendar events, and event metadata via ⌘K command palette
- **Admin dashboard** — portal admins can create and configure spaces, document sections, and view system-wide audit logs
- **Comprehensive Audit Logging** — every state-changing action is recorded (who, what, when, details) and viewable by admins, with filtering (action, entity, user, date range), pagination, and CSV export
- **Usage analytics** — first-party, aggregate page-view metrics (no third-party trackers, no per-member page tracking): active users (today/7d/30d), total views, a 30-day trend, and per-space / top-page breakdowns, shown on an admin Analytics dashboard
- **Read receipts** — members can mark documents as read; admins/secretariat can see who has read each document ("who is prepared")
- **Email notifications ("Notify me")** — members opt in per space and are emailed when a new document, Official Record, or meeting document lands (SMTP-backed; logs in mock mode when SMTP is unconfigured)
- **Official Records** — files prefixed with `_OFFICIAL_RECORD_` are tagged distinctly in listings and search
- **Mock mode** — runs fully without Google credentials (and without SMTP), using sample data, for UI development

---

## Architecture Overview

```
Browser / iPad
      │
      ▼
Next.js web app (port 3000)
  · Public landing page (no auth required)
  · App Router SSR pages
  · Middleware: validates session & passes Base64 encoded user info
  · API routes: thin proxies to BFF (streaming handlers for performance)
      │
      ▼
BFF / Backend-for-Frontend (port 3001)
  · Express server
  · Manages Keycloak OIDC tokens (never exposed to browser)
  · Calls Google APIs via Service Account (credentials never in browser)
  · Stores config, audit logs, read receipts & subscriptions in SQLite (dev) or PostgreSQL (prod)
      │
      ├──► Keycloak — OIDC auth
      ├──► Google Drive API — list, search & stream documents; upload
      ├──► Google Calendar API / iCal — upcoming meetings
      ├──► Discourse API — recent forum topics per space (public or private categories)
      ├──► SQLite / PostgreSQL — configuration & audit trail
      ├──► Redis — shared rate-limit counters (optional; in-memory fallback)
      └──► SMTP — email notifications for "Notify me" subscribers (optional)
```

**Security principle:** Keycloak tokens and Google Service Account credentials never leave the BFF. The browser only holds an httpOnly session cookie. All internal communication between Next.js and BFF uses encoded headers to maintain data integrity.

---

## Architecture & Codebase Improvements

### Performance
- **Streaming File Proxying**: File downloads and uploads are streamed directly through the BFF to the browser. This ensures high memory efficiency even for large documents, as the server never buffers the entire file.
- **Lazy Component Loading**: Large client-side components like the `react-pdf` viewer are dynamically imported, significantly reducing the initial page load for the dashboard and search views.
- **Optimized Search**: Uses Google Drive's native `fullText` search capabilities combined with indexed database metadata for fast, comprehensive results.
- **Drive API Caching**: File listings are cached with a 60-second TTL, and folder parent-chain lookups (used for ancestry verification) are cached for 5 minutes. Caches are automatically invalidated on upload, folder creation, and file deletion. This reduces Drive API quota usage by orders of magnitude under concurrent load.
- **Database Connection Pool**: PostgreSQL pool is sized for up to 250 concurrent users (min 2, max 25 connections).

### Security & Reliability
- **Header Encoding**: User metadata (name, email, groups) is Base64 encoded when passed from the Next.js middleware to the BFF. This prevents header-injection vulnerabilities and safely handles Unicode/special characters in user names.
- **Unified Error Handling**: A global JSON error handler in the BFF ensures that all API failures return consistent, helpful responses to the frontend.
- **Structured Logging**: The BFF logs newline-delimited JSON (via `pino`) with a level, ISO timestamp, and `service` field. Each request is assigned a correlation id (returned as the `x-request-id` header) and logged on completion with method, path, status and duration; downstream errors are logged with that id folded in, so a single request can be traced end-to-end in CloudWatch or any log aggregator. Sensitive headers are redacted; level is set via `LOG_LEVEL`. Health-check requests are skipped to keep the feed quiet.
- **Proxy Body Integrity**: Next.js API routes use `duplex: 'half'` streaming for POST requests, ensuring multipart/form-data (uploads) is forwarded correctly without corruption.
- **Rate Limiting**: All endpoints are rate-limited per IP (100 req/min global, 30 req/min for auth, 20 req/min for search, 10 req/min for uploads). Responses include standard `RateLimit-*` headers. Counters are stored in **Redis** when `REDIS_URL` is set, so limits hold consistently across multiple instances; without it, an in-memory store is used (single instance only).
- **CSRF Protection**: State-changing endpoints (`/documents`, `/admin`, `/events`, `/notifications`) require a `x-csrf-token` header on POST/PUT/DELETE requests. The frontend fetches a per-session token from `GET /csrf-token`, caches it, and attaches it to every mutating request (with a one-shot refresh if the token is rejected).
- **Route Error Boundaries**: Every portal route segment has an `error.tsx` and `loading.tsx` (plus a root `global-error.tsx` and `not-found.tsx`), so transient BFF/Drive failures render a calm retry UI rather than a broken screen.
- **Input Validation**: Admin forms, event metadata, and audit-log queries are validated with Zod before use; `icalUrl` values are restricted to `https` to reduce SSRF surface.
- **Folder Ancestry Verification**: User-supplied `folderId` parameters are validated against the space's Drive folder tree to prevent cross-space document access (IDOR protection). File downloads, deletions, Official Record snapshots, and read-receipt marking also verify the file belongs to the authorised space.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Repository Structure](#repository-structure)
3. [Keycloak Setup](#keycloak-setup)
4. [Google Cloud Setup](#google-cloud-setup)
5. [Environment Variables](#environment-variables)
6. [Local Development](#local-development)
7. [Admin: Configuring Spaces](#admin-configuring-spaces)
8. [Docker Deployment](#docker-deployment)
   - [Local dev (HTTP)](#step-5a-local-dev-http-only)
   - [Production with Let's Encrypt](#step-5b-production-with-lets-encrypt-https)
   - [Multi-architecture builds](#multi-architecture-builds-mac--linux)
9. [Production Deployment (Ubuntu)](#production-deployment-ubuntu)
10. [Security Notes](#security-notes)

---

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- Access to a **Keycloak** realm with admin rights
- A **Google Cloud** project with Drive API and Calendar API enabled
- A Google Cloud **Service Account** with access to your Shared Drives

---

## Repository Structure

```
quorum/
├── apps/
│   ├── web/                    # Next.js 15 frontend
│   │   ├── app/
│   │   │   ├── page.tsx        # Public landing page
│   │   │   ├── (portal)/       # Protected pages (auth-guarded by middleware)
│   │   │   │   ├── dashboard/  # Home: upcoming events + space quick-links
│   │   │   │   ├── spaces/
│   │   │   │   │   └── [spaceId]/
│   │   │   │   │       ├── documents/        # Default folder & section pages
│   │   │   │   │       ├── events/           # Event detail pages & agenda tool
│   │   │   │   │       └── calendar/         # Space calendar
│   │   │   │   ├── search/     # Unified search results
│   │   │   │   └── admin/      # Admin dashboard (portal_admin only)
│   │   │   └── api/            # Next.js API routes (streaming proxies to BFF)
│   │   ├── components/
│   │   │   ├── layout/         # Shell, Sidebar, SpaceNav, MobileHeader
│   │   │   ├── documents/      # DocumentList (+ read receipts), PDFViewer, UploadButton
│   │   │   ├── calendar/       # CalendarWidget, EventCard
│   │   │   ├── forum/          # ForumWidget — Discourse topics per space
│   │   │   ├── notifications/  # NotifyMeButton — per-space email opt-in
│   │   │   ├── common/         # ErrorState, LoadingState, FormattedText (sanitised)
│   │   │   └── admin/          # AdminShell (CRUD + Audit View with filters/export)
│   │   └── lib/
│   │   │   ├── auth.ts         # getUser() — decodes user from headers
│   │   │   ├── api-client.ts   # Typed BFF fetch wrapper
│   │   │   ├── csrf.ts         # CSRF token fetch/cache + csrfFetch wrapper
│   │   │   └── bff.ts          # Shared proxy header builder (cookie + CSRF)
│   │   └── middleware.ts       # Auth guard & User header injection
│   │   #  (each route segment also has error.tsx / loading.tsx boundaries)
│   │
│   └── bff/                    # Backend for Frontend (Express)
│       └── src/
│           ├── routes/
│           │   ├── auth.ts      # OIDC flow & session lifecycle
│           │   ├── documents.ts # List, download, upload (streaming) + read receipts
│           │   ├── events.ts    # Meeting doc linking & agenda management
│           │   ├── forum.ts     # Discourse topics by spaceId or aggregate
│           │   ├── search.ts    # Unified Drive + calendar search
│           │   ├── notifications.ts # "Notify me" subscription management
│           │   └── admin.ts     # CRUD + Audit (filter/CSV) + Backup/Restore
│           ├── middleware/
│           │   ├── rateLimiter.ts  # Per-endpoint rate limiting (Redis or in-memory)
│           │   └── csrf.ts        # CSRF token generation & validation
│           ├── utils/
│           │   ├── ttlCache.ts    # TTL cache for Drive API responses
│           │   └── rbac.ts        # Shared group/access helpers (single source of truth)
│           └── services/
│               ├── drive.ts     # Google Drive Service Account client (with caching)
│               ├── discourse.ts # Discourse public API client (mock-aware)
│               ├── mailer.ts    # SMTP mailer (nodemailer; mock/log mode)
│               ├── notifications.ts # Records activity & emails subscribers
│               ├── db.ts        # Knex migrations, audit/read-receipt/subscription services
│
└── packages/
    └── types/                  # Shared types (AuditLog, EventMetadata, etc.)
```

---

## Keycloak Setup

### 1. Create the Client

In your Keycloak Admin Console (`https://<your-keycloak>/admin`):

1. Select the correct **Realm** (e.g. `org`)
2. Go to **Clients** → **Create client**
3. Fill in:
   - **Client type:** `OpenID Connect`
   - **Client ID:** `quorum`
   - **Name:** `Quorum Governance Portal`
4. Click **Next**

### 2. Configure Capability Config

5. Enable:
   - ✅ **Client authentication** (confidential client — required for server-side token exchange)
   - ✅ **Standard flow** (Authorization Code flow)
   - ❌ Direct access grants — disable unless needed for testing
6. Click **Next**

### 3. Configure Login Settings

7. Set:
   - **Root URL:** `http://localhost:3001` (dev) or your production BFF URL
   - **Valid redirect URIs:**
     ```
     http://localhost:3001/auth/callback
     https://<your-bff-domain>/auth/callback
     ```
   - **Valid post logout redirect URIs:**
     ```
     http://localhost:3000
     https://<your-portal-domain>
     ```
   - **Web origins:**
     ```
     http://localhost:3000
     https://<your-portal-domain>
     ```
8. Click **Save**

### 4. Get the Client Secret

9. Go to the **Credentials** tab on the client
10. Copy the **Client secret** — this is your `KEYCLOAK_CLIENT_SECRET`

### 5. Add the Groups Mapper

The BFF reads a `groups` claim from the ID token to drive RBAC. You must configure a mapper to include group membership.

1. Go to **Clients** → `quorum` → **Client scopes** tab
2. Click on `quorum-dedicated` (the dedicated scope)
3. Go to **Mappers** → **Add mapper** → **By configuration** → **Group Membership**
4. Configure:
   - **Name:** `groups`
   - **Token Claim Name:** `groups`
   - **Full group path:** ✅ (on — paths like `/board-members`; or ❌ off for bare names like `board-members`)
   - **Add to ID token:** ✅
   - **Add to access token:** ✅
   - **Add to userinfo:** ✅
5. Click **Save**

> **Note on group path format:** The BFF and admin UI accept groups with or without the leading `/`. In space configuration, use the exact format that your Keycloak sends (check by logging in and inspecting the session at `GET /auth/session`).

### 6. Create Required Groups

Create these groups in **Groups** (at minimum):

| Group name | Purpose |
|---|---|
| `portal_admin` | Full admin dashboard access + all spaces |
| `secretariat` | (Optional) Default upload-permission group |
| Your governance groups | e.g. `board-members`, `general-assembly` |

Assign users to groups as appropriate.

---

## Google Cloud Setup

The BFF uses a **Service Account** to access the Google Drive API and optionally the Calendar API. Credentials are only ever held in the BFF environment — they never reach the browser.

### 1. Create or Select a Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (e.g. `org-quorum`) or select an existing one
3. Note the **Project ID** — this is your `GOOGLE_PROJECT_ID`

### 2. Enable Required APIs

1. Go to **APIs & Services** → **Library**
2. Search for and enable:
   - **Google Drive API**
   - **Google Calendar API** (if using calendar integration)

### 3. Create a Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Fill in:
   - **Name:** `quorum-drive-reader`
   - **Description:** `Service account for Quorum portal Drive/Calendar access`
4. Click **Create and Continue**
5. Skip role assignment at the project level (access is granted at the Drive folder level instead)
6. Click **Done**

### 4. Create and Download a Key

1. Click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key** → **Create new key**
4. Select **JSON** → **Create**
5. A JSON file downloads automatically — keep it safe, **do not commit it to git**

From this file, extract:

- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → `GOOGLE_PRIVATE_KEY` (see formatting note below)
- `project_id` → `GOOGLE_PROJECT_ID`

### 5. Set Up Shared Drives

> **Important:** Service accounts have no personal Drive storage quota. All Drive folders mapped to spaces **must** reside in a **Shared Drive** (formerly Team Drive). Standard My Drive folders will work for reading but uploads will fail with a quota error.

1. In Google Drive, create a Shared Drive (e.g. `Quorum Documents`)
2. Add the service account email as a member of the Shared Drive with **Content Manager** role (required for upload)
3. Create sub-folders within the Shared Drive for each space and section
4. Use the folder IDs from these sub-folders in the Admin dashboard

### 6. Get Folder IDs

To find a folder's ID:
1. Open the folder in Google Drive
2. The URL will be: `https://drive.google.com/drive/folders/<FOLDER_ID>`
3. Copy the `FOLDER_ID` — enter this when creating spaces/sections in the Admin dashboard

### 7. Format the Private Key for .env

The private key in the JSON file contains literal newlines. In a `.env` file, escape them as `\n` on a single line:

```bash
# In .env.local, put it all on one line with literal \n:
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEo...\n-----END RSA PRIVATE KEY-----\n"
```

### 8. Google Calendar Access

To surface calendar events in the portal, for each calendar:

1. Open **Google Calendar** → Settings (gear icon) → select the calendar
2. Under **Share with specific people**, add the service account email with **See all event details** permission
3. Note the **Calendar ID** (under **Integrate calendar**) — you'll enter this in the Admin dashboard when configuring a space

Alternatively, any space can use a public or private **iCal URL** instead of the Google Calendar API — paste it into the **iCal URL** field in the Admin dashboard.

---

## Environment Variables

Create these files before starting the app. Neither file should be committed to git (both are in `.gitignore`).

### `apps/bff/.env.local`

```env
# ── Server ──────────────────────────────────────────────────────────────────
PORT=3001

# ── Keycloak OIDC ────────────────────────────────────────────────────────────
KEYCLOAK_URL=https://snoauth.ihtsdotools.org
KEYCLOAK_REALM=org
KEYCLOAK_CLIENT_ID=quorum
KEYCLOAK_CLIENT_SECRET=<paste client secret from Keycloak Credentials tab>
KEYCLOAK_REDIRECT_URI=http://localhost:3001/auth/callback

# ── Session ──────────────────────────────────────────────────────────────────
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=<32+ character random string>
SESSION_COOKIE_NAME=quorum_session

# ── Google APIs (Service Account) ────────────────────────────────────────────
GOOGLE_SERVICE_ACCOUNT_EMAIL=quorum-drive-reader@<project-id>.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n<key with \n escapes>\n-----END RSA PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=<gcp-project-id>

# ── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=file:./dev.db

# ── CORS ─────────────────────────────────────────────────────────────────────
FRONTEND_ORIGIN=http://localhost:3000

# ── Discourse ─────────────────────────────────────────────────────────────────
# Base URL of the Discourse forum. Override per environment (e.g. staging forum).
DISCOURSE_URL=https://forums.snomed.org
# DISCOURSE_MOCK=true   # Uncomment to return mock topics without hitting the API

# Discourse API credentials — required only for private/restricted categories.
# Leave both unset if your forum categories are fully public.
#
# Setup (one-time, in Discourse admin):
#   1. Create a system user (e.g. "quorum-system") and add it to every private group
#      whose categories should be surfaced in the portal (trust level ≥ 1 required).
#   2. Admin → API → New API Key → User Level: Single User → User: quorum-system
#      → Scope: Global (or Topics → Read at minimum). Copy the key — shown only once.
#   3. Ensure the private category's Security tab grants "See" permission to that group.
#
# DISCOURSE_API_KEY=<paste key from step 2>
# DISCOURSE_API_USERNAME=quorum-system   # must match the Discourse username exactly (case-sensitive)

# ── Rate Limiting (requests per minute per IP, defaults shown) ───────────────
# RATE_LIMIT_GLOBAL=100
# RATE_LIMIT_AUTH=30
# RATE_LIMIT_SEARCH=20
# RATE_LIMIT_UPLOAD=10

# ── Cache TTLs (seconds, defaults shown) ─────────────────────────────────────
# CACHE_TTL_DRIVE_LIST=60        # file listing cache
# CACHE_TTL_DRIVE_ANCESTRY=300   # folder ancestry verification cache

# ── Database Pool ────────────────────────────────────────────────────────────
# DB_POOL_MAX=25                 # max PostgreSQL connections

# ── Rate limiting store (optional) ───────────────────────────────────────────
# Share rate-limit counters across instances via Redis. Omit for an in-memory
# store (fine for single-instance / local dev). Docker Compose sets this to
# redis://redis:6379 automatically.
# REDIS_URL=redis://localhost:6379

# ── Email notifications (SMTP, optional) ─────────────────────────────────────
# Used by the "Notify me" feature. If SMTP_HOST is unset the mailer runs in
# mock mode (logs the email it would send instead of dialling out).
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_SECURE=false              # true for implicit TLS (usually port 465)
# SMTP_USER=<smtp-username>
# SMTP_PASS=<smtp-password>
# SMTP_FROM=Quorum <no-reply@example.com>

# ── Logging ──────────────────────────────────────────────────────────────────
# Level: trace | debug | info | warn | error | fatal | silent.
# Defaults to debug in development, info in production.
# LOG_LEVEL=debug
```

### `apps/web/.env.local`

```env
# BFF base URL — server-side only, never exposed to the browser
BFF_URL=http://localhost:3001

# Public app name
NEXT_PUBLIC_APP_NAME=Quorum

# Discourse forum base URL — used by ForumWidget (server component) to build category links.
# Must match the BFF value. Override per environment if using a staging forum.
DISCOURSE_URL=https://forums.snomed.org

# Development bypass (optional)
# DEV_AUTH_BYPASS=true
```

---

## Local Development

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Create env files (see above)

# 3. Build and start both services
pnpm dev
#  → Next.js:  http://localhost:3000
#  → BFF:      http://localhost:3001
```

**Mock mode:** Without real Google credentials, the app runs using sample data, allowing UI development without external dependencies.

---

## Testing

```bash
# Unit + component tests (BFF via vitest/node, web via vitest/jsdom + Testing Library)
pnpm test

# Coverage (BFF)
pnpm test:coverage

# End-to-end tests (Playwright — Chromium + iPad emulation)
pnpm test:e2e
```

- **BFF** — `vitest` route/service/middleware tests with mocked Google/DB/SMTP (`apps/bff/src/**/*.test.ts`).
- **Web components** — `@testing-library/react` under `vitest`/jsdom for the key UI (`DocumentList` read receipts & filters, `NotifyMeButton`, `FormattedText` sanitisation, `ErrorState`, the CSRF client) — `apps/web/**/*.test.tsx`.
- **E2E** — `Playwright` specs in `e2e/` drive the real app booted in **dev-auth-bypass + mock mode** (no Keycloak, Google, Redis or SMTP needed): public landing, dashboard, spaces navigation, document listing, PDF viewer open/close, and the Official Records filter. A second project runs the smoke suite under **iPad Pro emulation** for touch/layout coverage. `globalSetup` builds shared types and seeds sample spaces into a throwaway SQLite DB; Playwright starts the BFF and web dev servers automatically.

> The E2E stack relies on the BFF's mock mode (sample Drive files) and the `DEV_AUTH_BYPASS` dev-only bypass, so it never contacts external services. In CI a dedicated job installs Chromium and runs the full suite.

---

## Admin: Configuring Spaces & System Health

Log in with a Keycloak account in the `portal_admin` group, then navigate to `/admin`.

### Space & Section Configuration
A **Space** represents a governance group (e.g. "Management Board"). Each space maps a Keycloak group to a Google Drive folder. **Sections** subdivide documents into categories like "Agendas" or "Papers".

Each space can optionally be linked to a **Discourse category** by entering the category slug (e.g. `board-members`) in the admin form. When set, recent topics from that category appear as a widget on the space overview page, linking out to `forums.snomed.org`.

**Private Discourse categories:** If the category is restricted to a group, the BFF must be given API credentials. See the `DISCOURSE_API_KEY` / `DISCOURSE_API_USERNAME` variables in the environment variables section above. The system user behind those credentials must be a member of the relevant Discourse group.

### Audit Logs
The **Audit Log** tab provides a real-time feed of all modifications:
- **Who**: Unique Keycloak identifier and display name.
- **Action**: Categorised actions (e.g., `CREATE_SPACE`, `UPLOAD_DOCUMENT`, `DELETE_EVENT_AGENDA`).
- **Details**: Click the **Info** icon to view the exact JSON payload of the change.
- **Filtering & export**: Narrow the feed by action, entity type, user, and date range; page through results with **Load more**; and **Export CSV** to download the filtered set for compliance or record-keeping.

### Analytics
The **Analytics** tab shows first-party usage metrics: active users today / last 7 days / last 30 days, total page views, a 30-day views trend, and per-space and top-page breakdowns. Page views are recorded server-side via a lightweight beacon (`POST /metrics/view`) sent by the portal on each navigation — there are **no third-party trackers or cookies**; data lives in the app's own database.

The data is **aggregate only**: it counts views and active users but never records which member viewed which page. Views are stored as anonymous per-page/per-day counts, and unique-user counts come from an opaque, irreversible visitor token (an HMAC of the user id with the server secret) recorded per day — so no names or reversible identifiers are kept. Admin pages are excluded from tracking.

### Read Receipts
On any document list, members can mark a document as **read** (the toggle in the *Read* column). Admins and secretariat see a **Read by** control per document showing who has read it and when — useful for confirming a board is prepared ahead of a meeting.

### Notifications ("Notify me")
Each space page has a **Notify me** button. When a member opts in, their account email is captured and they are emailed whenever a new document, Official Record, or linked meeting document lands in that space. Delivery requires SMTP to be configured (see `SMTP_*` in the environment variables); without it the mailer logs instead of sending. Agenda-item edits are intentionally *not* notified to avoid noise. The member who triggered the activity is excluded from the fan-out (you don't get emailed about your own upload).

The admin **Notifications** tab shows who has subscribed to each space, and a **Send test email** button that emails your own address through the configured SMTP — the quickest way to verify delivery end-to-end (it reports explicitly when SMTP is unconfigured/mock). Every fan-out is logged (`"Notification fan-out"` with recipient/sent counts). Subscriptions are included in site **Export/Import**.

**Files added directly in Google Drive** (bypassing the portal) are also detected: a background **polling sweep** lists each space's Drive folders every `DRIVE_SWEEP_INTERVAL` seconds (default 600, `0` disables), diffs against a seen-file table, and notifies subscribers about anything new. The first sweep of a space seeds silently (no notification storm about pre-existing files), portal uploads are pre-marked so they're never double-notified, and the seen-table's primary key makes the sweep safe across multiple BFF instances. The sweep is automatically disabled in mock mode.

### Backup & Restore
Admins can **Export** the entire portal configuration as a JSON file and **Import** it to restore or migrate settings.

---

## Docker Deployment

Quorum ships with a base Docker Compose stack for local development (HTTP) and a production overlay (`docker-compose.prod.yml`) that adds Let's Encrypt TLS via certbot.

### Docker Architecture

```
Internet / localhost
       │
       ▼
nginx container (port 80, + port 443 in production)
  ├── /auth/*        → bff:3001     Keycloak OIDC redirects
  ├── /health        → bff:3001     Health check
  ├── /_next/static  → web:3000     Cached static assets
  └── /*             → web:3000     Next.js pages + API routes
                          │
                          └── server-side → bff:3001
                                              │
                                              ├── postgres:5432
                                              └── redis:6379   (rate-limit store)

certbot (production only) — renews Let's Encrypt certs every 12 h
```

All containers run on an internal Docker bridge network. Only nginx publishes ports to the host.

### Prerequisites

- Docker Engine ≥ 20 and Docker Compose v2
- The Keycloak client and Google Service Account already configured (see sections above)

### Step 1: Create Environment Files

```bash
# Root .env — Docker Compose reads this automatically for variable interpolation
cp .env.example .env

# Per-service env files
cp deploy/docker/bff.env.example deploy/docker/bff.env
cp deploy/docker/web.env.example deploy/docker/web.env
```

### Step 2: Configure the root `.env`

Docker Compose reads `.env` from the project root (alongside `docker-compose.yml`) and uses it to interpolate variables across both `docker-compose.yml` and `docker-compose.prod.yml`. See `.env.example` for all available variables.

| Variable | Local dev | Production |
|---|---|---|
| `POSTGRES_PASSWORD` | any string | strong random password |
| `PUBLIC_URL` | `http://localhost` | `https://your.domain.com` |
| `COOKIE_SECURE` | `false` | `true` |
| `DOMAIN` | *(unused)* | `your.domain.com` (no `https://`) |
| `CERTBOT_EMAIL` | *(unused)* | admin email for Let's Encrypt |

> **Why a root `.env`?** `docker compose` automatically loads `.env` from the project directory, making all variables available for interpolation in both compose files without any `--env-file` flags. `FRONTEND_ORIGIN` (used for CORS and post-login redirects) is set from `PUBLIC_URL` — if this is wrong, logins will redirect to the wrong host after Keycloak returns.

### Step 3: Configure `deploy/docker/bff.env`

Fill in every `CHANGE_ME` value:

| Variable | Source |
|---|---|
| `KEYCLOAK_URL` | Your Keycloak base URL (e.g. `https://snoauth.example.org`) |
| `KEYCLOAK_REALM` | Keycloak realm name |
| `KEYCLOAK_CLIENT_SECRET` | Keycloak Admin → Clients → quorum → Credentials |
| `KEYCLOAK_REDIRECT_URI` | Must be `<PUBLIC_URL>/auth/callback` — must also be registered in Keycloak's Valid Redirect URIs |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | From the GCP Service Account JSON |
| `GOOGLE_PRIVATE_KEY` | From the GCP Service Account JSON (keep `\n` escapes) |
| `GOOGLE_PROJECT_ID` | From the GCP Service Account JSON |
| `DISCOURSE_URL` | Your Discourse forum base URL |

To enable **email notifications** in Docker, add the `SMTP_*` variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) to `deploy/docker/bff.env`. Without them the "Notify me" feature runs in mock mode (logs instead of sending).

> **Note:** `DATABASE_URL`, `REDIS_URL`, `PORT`, `NODE_ENV`, `FRONTEND_ORIGIN`, and `COOKIE_SECURE` are injected by `docker-compose.yml` from the root `.env` and must **not** be duplicated in `bff.env` — `docker-compose.yml` environment values take precedence over `env_file` values. A `redis` service is started automatically and the BFF uses it for shared rate-limit counters.

### Step 4: Configure `deploy/docker/web.env`

Set `DISCOURSE_URL` to match the BFF value. `NEXT_PUBLIC_APP_NAME` defaults to `Quorum`.

### Step 5a: Local dev (HTTP only)

```bash
# Build images
docker compose build

# Start the stack
docker compose up -d

# Verify
docker compose ps
curl http://localhost/health
```

Visit `http://localhost`. Click **Sign in** to test the Keycloak OIDC flow.

### Step 5b: Production with Let's Encrypt (HTTPS)

All production commands use both compose files:

```bash
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
```

**One-time TLS bootstrap** (run once per server):

```bash
# 1. Edit nginx-prod.conf — replace CHANGE_ME_DOMAIN with your actual domain
nano deploy/docker/nginx-prod.conf

# 2. Start nginx on HTTP first (cert doesn't exist yet — HTTPS config would crash)
$COMPOSE up -d nginx web bff postgres

# 3. Issue the certificate (runs certbot once then exits)
$COMPOSE --profile init run --rm certbot-init

# 4. Bring up the full stack — nginx now loads the HTTPS config
$COMPOSE up -d
```

**Subsequent deploys:**

```bash
$COMPOSE pull   # if using pre-built images from a registry
$COMPOSE build  # or rebuild from source
$COMPOSE up -d
```

The `certbot` service runs continuously and renews certificates automatically before they expire.

### Multi-Architecture Builds (Mac + Linux)

To build images that run on both Apple Silicon (arm64) and Linux servers (amd64):

```bash
# One-time setup
docker buildx create --name multibuilder --use
docker buildx inspect --bootstrap

# Build and push both architectures in one step
docker buildx build --platform linux/amd64,linux/arm64 \
  -f apps/bff/Dockerfile -t yourname/quorum-bff:latest --push .

docker buildx build --platform linux/amd64,linux/arm64 \
  -f apps/web/Dockerfile -t yourname/quorum-web:latest --push .
```

Docker Hub stores both architectures under the same tag and serves the correct one per host automatically.

### Local Dev Without Keycloak

Uncomment `DEV_AUTH_BYPASS=true` in `deploy/docker/bff.env`. This injects a fake admin user for all requests without touching Keycloak.

### Managing the Stack

```bash
# Local dev
docker compose logs -f
docker compose logs -f bff
docker compose restart web
docker compose build web bff && docker compose up -d
docker compose down          # preserves postgres_data volume
docker compose down -v       # deletes all data

# Production
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
$COMPOSE logs -f
$COMPOSE restart nginx
$COMPOSE build web bff && $COMPOSE up -d
```

### Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| After Keycloak login, redirects to `localhost/dashboard` | `PUBLIC_URL` in root `.env` is wrong or root `.env` doesn't exist | Create root `.env` from `.env.example`, set `PUBLIC_URL=https://your.domain.com`, restart BFF |
| nginx crashes: `cannot load certificate` | HTTPS nginx config loaded before cert exists | Follow the bootstrap procedure (Step 5b): start HTTP-only first, then run `certbot-init` |
| `Missing OAuth state or nonce` after callback | `COOKIE_SECURE=true` but serving over HTTP | Set `COOKIE_SECURE=false` or add TLS |
| BFF: `Cannot find module '/app/dist/index.js'` | Build output path mismatch | `docker compose build --no-cache bff` |
| Every page redirects to Keycloak | Stale image or session issue | `docker compose build --no-cache web` and clear browser cookies |
| BFF: `Keycloak discovery failed` | Keycloak URL unreachable from Docker network | Ensure the URL is reachable from inside the container (not `localhost`) |
| nginx: 502 Bad Gateway | Upstream container not ready | `docker compose ps` — wait for health checks |
| Database connection refused | PostgreSQL not healthy | `docker compose logs postgres` |

### Docker File Reference

| File | Purpose |
|---|---|
| `docker-compose.yml` | Base stack — local dev, HTTP only (postgres, redis, bff, web, nginx) |
| `docker-compose.prod.yml` | Production overlay — adds HTTPS port, certbot, Let's Encrypt volume |
| `apps/bff/Dockerfile` | Multi-stage BFF build (pnpm deploy + tsc) |
| `apps/web/Dockerfile` | Multi-stage Next.js standalone build |
| `deploy/docker/nginx.conf` | HTTP-only nginx config (local dev + TLS bootstrap) |
| `deploy/docker/nginx-prod.conf` | Full HTTPS nginx config (production, activated by prod overlay) |
| `.env.example` | Root `.env` template — copy to `.env` at repo root |
| `deploy/docker/.env.example` | Alternative env template (for `--env-file` usage) |
| `deploy/docker/bff.env.example` | BFF secrets template |
| `deploy/docker/web.env.example` | Web env template |

---

## Production Deployment (Ubuntu)

Quorum runs as two systemd services (BFF + Web) fronted by nginx with TLS termination. This section covers deploying to Ubuntu 22.04 or 24.04 LTS.

### Production Architecture

```
Internet
   │
   ▼
nginx (port 443 / 80)
  ├── /auth/*      → BFF  (127.0.0.1:3001)   Keycloak OIDC redirects
  ├── /health      → BFF  (127.0.0.1:3001)   Monitoring
  ├── /_next/*     → Web  (127.0.0.1:3000)   Static assets (long cache)
  └── /*           → Web  (127.0.0.1:3000)   Next.js pages + API routes
                            │
                            └── server-side → BFF (127.0.0.1:3001)
```

Both services bind to `127.0.0.1` only. nginx handles all external traffic and TLS.

### Deploy Prerequisites

- Ubuntu 22.04 or 24.04 LTS with root/sudo access
- A domain name with a DNS A record pointing to the server
- Keycloak client secret, Google Service Account JSON, and optionally a Discourse API key

### Step 1: Clone the Repository

```bash
sudo mkdir -p /opt/quorum
sudo chown $(whoami):$(whoami) /opt/quorum
git clone <your-repo-url> /opt/quorum
cd /opt/quorum
```

### Step 2: Run the Setup Script

```bash
sudo bash deploy/setup.sh your-domain.example.com
```

This installs Node.js 20, pnpm, nginx, PostgreSQL, certbot, and build tools. It creates a `quorum` system user, a PostgreSQL database with an auto-generated password, systemd unit files, nginx config, and env file stubs with pre-filled `DATABASE_URL` and `SESSION_SECRET`.

### Step 3: Configure Environment Variables

```bash
sudo nano /opt/quorum/deploy/env/bff.env
```

Fill in every value marked `FILL_IN`:

| Variable | Source |
|---|---|
| `KEYCLOAK_CLIENT_SECRET` | Keycloak Admin → Clients → quorum → Credentials |
| `KEYCLOAK_REDIRECT_URI` | `https://your-domain.example.com/auth/callback` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | GCP Service Account JSON → `client_email` |
| `GOOGLE_PRIVATE_KEY` | GCP Service Account JSON → `private_key` (keep `\n` escapes) |
| `GOOGLE_PROJECT_ID` | GCP Service Account JSON → `project_id` |
| `FRONTEND_ORIGIN` | `https://your-domain.example.com` (no trailing slash) |

> Also update your Keycloak client's **Valid Redirect URIs** to include the production callback URL.

The web env file (`deploy/env/web.env`) is pre-filled and typically needs no changes.

### Step 4: Build and Deploy

```bash
sudo bash deploy/deploy.sh
```

This installs dependencies, builds all packages, copies static assets, and restarts services. It waits for the BFF health check before starting the web server.

### Step 5: Obtain a TLS Certificate

```bash
sudo certbot --nginx -d your-domain.example.com
```

Verify auto-renewal is scheduled:

```bash
systemctl list-timers | grep certbot
```

### Updating the Application

```bash
cd /opt/quorum
git pull origin main
sudo bash deploy/deploy.sh
```

Sessions survive restarts because they are stored in PostgreSQL (not in memory).

### Using a Remote PostgreSQL (e.g. AWS RDS)

To use a managed database instead of local PostgreSQL, update `DATABASE_URL` in `deploy/env/bff.env`:

```
DATABASE_URL=postgresql://quorum:password@your-rds-endpoint.rds.amazonaws.com:5432/quorum
```

The setup script's local PostgreSQL step is harmless if you use a remote database — just ignore it.

### Managing Services

```bash
# View live logs
journalctl -u quorum-bff -f
journalctl -u quorum-web -f

# Restart
sudo systemctl restart quorum-bff
sudo systemctl restart quorum-web

# Status
sudo systemctl status quorum-bff
sudo systemctl status quorum-web

# Health check
curl http://127.0.0.1:3001/health
```

### Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| BFF: `SESSION_SECRET is not set` | Env file missing or wrong permissions | `chmod 600 deploy/env/bff.env` and check contents |
| BFF: `DB migration failed` | PostgreSQL not running or bad URL | `systemctl status postgresql` or check `DATABASE_URL` |
| BFF: `Keycloak discovery failed` | Keycloak URL unreachable | BFF starts anyway; auth won't work until fixed |
| nginx: 502 Bad Gateway | Upstream service not running | Check `systemctl status quorum-bff quorum-web` |
| Permission denied | Files not owned by quorum user | `sudo chown -R quorum:quorum /opt/quorum` |

### Deployment File Reference

| File | Purpose |
|---|---|
| `deploy/setup.sh` | One-time server provisioning |
| `deploy/deploy.sh` | Build + restart (run on every update) |
| `deploy/quorum-bff.service` | systemd unit for Express BFF |
| `deploy/quorum-web.service` | systemd unit for Next.js frontend |
| `deploy/nginx/quorum.conf` | nginx reverse proxy config (template with `QUORUM_DOMAIN` placeholder) |
| `deploy/env/bff.env.example` | BFF env var template (in git) |
| `deploy/env/web.env.example` | Web env var template (in git) |

---

## Security Notes

- **Credential Isolation**: Keycloak secrets and Google SA keys never leave the BFF environment.
- **No Direct Drive Links**: All documents are streamed via proxy to avoid exposing pre-signed URLs or requiring users to access Google domains directly.
- **RBAC Enforcement**: Permissions (Read, Upload, Admin) are validated at the BFF layer using the signed `groups` claim.
- **Header Integrity**: User metadata is Base64 encoded in internal headers to prevent injection and safely handle special characters.
- **Google Doc Proxying**: Google Docs linked to events are exported as PDF by the BFF, bypassing firewall restrictions for users unable to access Google domains.
- **CSRF Tokens**: All state-changing requests to `/documents`, `/admin`, `/events`, and `/notifications` require a valid `x-csrf-token` header. Tokens are per-session and retrieved via `GET /csrf-token`. GET/HEAD/OPTIONS requests are exempt.
- **Rate Limiting**: Per-IP rate limits protect against automated abuse. Limits are applied globally (100/min) and with tighter thresholds on auth (30/min), search (20/min), and upload (10/min) endpoints. Rate-limited requests receive a `429 Too Many Requests` response. When `REDIS_URL` is configured the counters are shared through Redis so limits hold across multiple instances; otherwise an in-memory store is used.
- **Folder/File Ancestry Verification**: When a user supplies a `folderId` query parameter, the BFF walks the Google Drive parent chain to verify the folder is a descendant of the space's configured root folder. File downloads, deletions, Official Record snapshots, and read-receipt marking similarly verify file ownership. This prevents authenticated users from accessing documents in spaces they are not authorised for.
- **Email Privacy**: "Notify me" subscriptions store the member's own session email only; there is no external directory lookup. Notification emails are sent to a space's opt-in subscribers, excluding the actor who triggered the event.
- **Session Store Safety**: In production, sessions are stored in PostgreSQL. If `DATABASE_URL` is not a PostgreSQL connection string, the BFF logs a warning about falling back to the in-memory session store (which does not scale and loses sessions on restart).
