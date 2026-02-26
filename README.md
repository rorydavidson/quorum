# Quorum — Online Governance Portal

A bespoke governance portal replacing use of services like Atlassian Confluence for an organisation's governance bodies. Built for multiple devices with a nod to iPad use, with Keycloak SSO, Google Drive document surfacing, and role-based access control.

---

## Features

- **Public landing page** with SSO sign-in button
- **Keycloak OIDC authentication** — full authorization code flow, httpOnly session cookie, group-based RBAC
- **Document spaces** — each governance group gets a space backed by a Google Drive folder; supports nested sections (e.g. Agendas, Minutes, Board Papers)
- **Contextual space sidebar** — when inside a space, a secondary sidebar shows overview, document sections, and calendar links
- **File upload** — authorised users (per-space upload groups) can upload documents directly to the Drive folder from the portal
- **In-portal PDF viewer** — view PDFs without leaving the browser; avoids iOS redirecting to external apps
- **Calendar integration** — upcoming meetings per space via Google Calendar API or iCal URL
- **Unified search** — full-text search across Drive documents and calendar events via ⌘K command palette
- **Admin dashboard** — portal admins can create and configure spaces and document sections (no code changes needed)
- **Official Records** — files prefixed with `_OFFICIAL_RECORD_` are tagged distinctly in listings and search
- **Mock mode** — runs fully without Google credentials, using sample data, for UI development

---

## Architecture Overview

```
Browser / iPad
      │
      ▼
Next.js web app (port 3000)
  · Public landing page (no auth required)
  · App Router SSR pages
  · Middleware: validates session on every protected request
  · API routes: thin proxies to BFF (no direct browser→BFF calls)
      │
      ▼
BFF / Backend-for-Frontend (port 3001)
  · Express server
  · Manages Keycloak OIDC tokens (never exposed to browser)
  · Calls Google APIs via Service Account (credentials never in browser)
  · Stores space/section config in SQLite (dev) or PostgreSQL (prod)
      │
      ├──► Keycloak — OIDC auth
      ├──► Google Drive API — list, search & stream documents; upload
      ├──► Google Calendar API / iCal — upcoming meetings
      └──► SQLite / PostgreSQL — space configuration
```

**Security principle:** Keycloak tokens and Google Service Account credentials never leave the BFF. The browser only holds an httpOnly session cookie.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Repository Structure](#repository-structure)
3. [Keycloak Setup](#keycloak-setup)
4. [Google Cloud Setup](#google-cloud-setup)
5. [Environment Variables](#environment-variables)
6. [Local Development](#local-development)
7. [Admin: Configuring Spaces](#admin-configuring-spaces)
8. [Deployment](#deployment)
9. [Security Notes](#security-notes)

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
│   │   │   │   │   ├── page.tsx              # All accessible spaces
│   │   │   │   │   └── [spaceId]/
│   │   │   │   │       ├── layout.tsx        # Space sidebar injection
│   │   │   │   │       ├── page.tsx          # Space overview
│   │   │   │   │       ├── documents/        # Default folder & section pages
│   │   │   │   │       └── calendar/         # Space calendar
│   │   │   │   ├── search/     # Unified search results
│   │   │   │   └── admin/      # Admin dashboard (portal_admin only)
│   │   │   └── api/            # Next.js API routes (proxies to BFF)
│   │   ├── components/
│   │   │   ├── layout/         # Shell, Sidebar, SpaceNav, MobileHeader, NavDrawer
│   │   │   ├── documents/      # DocumentList, PDFViewer, UploadButton
│   │   │   ├── calendar/       # CalendarWidget, EventCard
│   │   │   ├── search/         # SearchBar (⌘K palette), SearchInput
│   │   │   └── admin/          # AdminShell (full CRUD UI)
│   │   ├── lib/
│   │   │   ├── auth.ts         # getUser(), isAdmin() — reads middleware header
│   │   │   └── api-client.ts   # Typed BFF fetch wrapper
│   │   └── middleware.ts       # Auth guard; / and /api/auth are public
│   │
│   └── bff/                    # Backend for Frontend (Express)
│       └── src/
│           ├── routes/
│           │   ├── auth.ts      # /auth/login, /auth/callback, /auth/logout, /auth/session
│           │   ├── documents.ts # /documents/:spaceId — list, download, upload
│           │   ├── calendar.ts  # /calendar — events via Google Calendar or iCal
│           │   ├── search.ts    # /search — unified Drive + calendar search
│           │   └── admin.ts     # /admin — CRUD for spaces/sections
│           └── services/
│               ├── keycloak.ts  # OIDC token exchange & JWKS verification
│               ├── drive.ts     # Google Drive Service Account client
│               ├── calendar.ts  # Google Calendar + node-ical client
│               └── db.ts        # Knex + SQLite/Postgres config store
│
└── packages/
    └── types/                  # Shared TypeScript types (SessionUser, SpaceConfig, etc.)
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

### 7. Verify the Discovery Endpoint

The BFF auto-discovers Keycloak configuration from:
```
https://<KEYCLOAK_URL>/realms/<REALM>/.well-known/openid-configuration
```

Confirm this URL is reachable from your BFF server before deploying.

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

**Quick extraction command** (from the downloaded JSON key file):

```bash
python3 -c "
import json, sys
with open('service-account-key.json') as f:
    data = json.load(f)
print('GOOGLE_SERVICE_ACCOUNT_EMAIL=' + data['client_email'])
print('GOOGLE_PROJECT_ID=' + data['project_id'])
key = data['private_key'].replace('\n', '\\\\n')
print('GOOGLE_PRIVATE_KEY=\"' + key + '\"')
"
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
# SQLite for local dev:
DATABASE_URL=file:./dev.db
# PostgreSQL for production:
# DATABASE_URL=postgresql://user:password@host:5432/quorum

# ── CORS ─────────────────────────────────────────────────────────────────────
FRONTEND_ORIGIN=http://localhost:3000
```

### `apps/web/.env.local`

```env
# BFF base URL — server-side only, never exposed to the browser
BFF_URL=http://localhost:3001

# Public app name (safe to expose)
NEXT_PUBLIC_APP_NAME=Quorum

# Development only: skip Keycloak and inject a mock portal_admin user
# Never set this in production
# DEV_AUTH_BYPASS=true
```

---

## Local Development

```bash
# 1. Install all workspace dependencies (also compiles native modules e.g. better-sqlite3)
pnpm install

# 2. Create env files (see above)
#    apps/bff/.env.local  — BFF secrets
#    apps/web/.env.local  — BFF URL

# 3. Build and start both services
pnpm dev
#  → Next.js:  http://localhost:3000
#  → BFF:      http://localhost:3001

# Or start individually:
pnpm --filter bff dev
pnpm --filter web dev
```

> `pnpm dev` runs a full build before starting the dev servers to ensure compiled assets and types are up to date.

On first startup the BFF automatically creates the SQLite database and runs schema migrations. No separate migration command is needed in development.

**Without Google credentials configured**, the app runs in **mock mode** — Drive returns sample documents, downloads serve a placeholder PDF, and calendar events are empty. This lets you develop and test the UI without real credentials. Combine with `DEV_AUTH_BYPASS=true` in `apps/web/.env.local` to skip Keycloak entirely and use an injected `portal_admin` user.

### Useful Commands

```bash
# Type-check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Build for production (types → bff → web)
pnpm build
```

---

## Admin: Configuring Spaces

Log in with a Keycloak account in the `portal_admin` group, then navigate to `/admin`.

### Create a Space

A **Space** represents a governance group (e.g. "Management Board"). Each space maps to:
- A **Keycloak group** — controls who can see it
- A **Google Drive folder ID** — the default document folder

| Field | Description |
|---|---|
| ID | URL-safe slug, e.g. `board` |
| Name | Display name, e.g. `Management Board` |
| Description | Optional subtitle shown on the space page |
| Keycloak Group | Exact group name/path from Keycloak, e.g. `/board-members` |
| Drive Folder ID | Folder ID from a Shared Drive folder URL |
| Calendar ID | Google Calendar ID for the meetings panel |
| iCal URL | Alternative to Calendar ID — accepts any iCal feed URL |
| Upload Groups | Comma-separated groups whose members may upload to this space |
| Category | Groups spaces in the sidebar, e.g. `Board Level` |
| Sort Order | Numeric ordering within the category |

### Create Document Sections

A **Section** subdivides a space's documents into named categories, each backed by a separate Drive folder (e.g. "Agendas", "Minutes & Resolutions", "Board Papers").

1. Expand a space in the admin list
2. Click **Add Section**

| Field | Description |
|---|---|
| ID | Slug within the space, e.g. `agendas` |
| Name | Display name, e.g. `Agendas` |
| Description | Optional |
| Drive Folder ID | Separate Shared Drive folder for this category |
| Sort Order | Display order within the space |

When sections are configured, the space landing page shows them as a prominent navigation grid and the space sidebar lists them as sub-links under Documents.

### Official Records

Any file whose name begins with `_OFFICIAL_RECORD_` (e.g. `_OFFICIAL_RECORD_2024-12-15_Annual-Report.pdf`) is automatically tagged as an official record in document listings and search results. The prefix is stripped for display.

---

## Deployment

> Full deployment infrastructure (Docker, AWS ECS) is planned for Phase 10. Summary of target architecture:

```
Local dev
  └──► Docker Compose (web + bff + postgres)
         └──► AWS ECS Fargate
                · web container  → port 3000
                · bff container  → port 3001
                · ALB: /* → web, /bff/* → bff
              AWS RDS (PostgreSQL)
              AWS Secrets Manager (Google SA key + Keycloak secret)
```

For production, ensure:
- `SESSION_COOKIE_NAME` cookie is set with `secure: true` (HTTPS only)
- `DATABASE_URL` points to a PostgreSQL instance
- `FRONTEND_ORIGIN` is set to your production domain (BFF CORS)
- `DEV_AUTH_BYPASS` is **not** set

---

## Security Notes

- **Keycloak tokens** are held exclusively in the BFF session store — they are never sent to the browser.
- **Google Service Account** credentials are BFF-only env vars — never use `NEXT_PUBLIC_` prefixes for anything sensitive.
- **File downloads** are streamed through the BFF — no pre-signed Drive URLs are issued to the browser.
- **RBAC** is enforced server-side from the `groups` claim in the Keycloak ID token. Client-supplied group claims are never trusted.
- **Admin routes** (`/admin`, `/api/admin/*`) require both authentication and `portal_admin` group membership, enforced at the BFF middleware layer.
- **Upload permissions** are validated server-side against the space's configured `uploadGroups` — the client cannot escalate privileges.
