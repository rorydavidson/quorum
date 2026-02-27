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
- **Unified search** — full-text search across Drive documents, calendar events, and event metadata via ⌘K command palette
- **Admin dashboard** — portal admins can create and configure spaces, document sections, and view system-wide audit logs
- **Comprehensive Audit Logging** — every state-changing action is recorded (who, what, when, details) and viewable by admins
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
  · Middleware: validates session & passes Base64 encoded user info
  · API routes: thin proxies to BFF (streaming handlers for performance)
      │
      ▼
BFF / Backend-for-Frontend (port 3001)
  · Express server
  · Manages Keycloak OIDC tokens (never exposed to browser)
  · Calls Google APIs via Service Account (credentials never in browser)
  · Stores space/section config & audit logs in SQLite (dev) or PostgreSQL (prod)
      │
      ├──► Keycloak — OIDC auth
      ├──► Google Drive API — list, search & stream documents; upload
      ├──► Google Calendar API / iCal — upcoming meetings
      └──► SQLite / PostgreSQL — configuration & audit trail
```

**Security principle:** Keycloak tokens and Google Service Account credentials never leave the BFF. The browser only holds an httpOnly session cookie. All internal communication between Next.js and BFF uses encoded headers to maintain data integrity.

---

## Architecture & Codebase Improvements

### Performance
- **Streaming File Proxying**: File downloads and uploads are streamed directly through the BFF to the browser. This ensures high memory efficiency even for large documents, as the server never buffers the entire file.
- **Lazy Component Loading**: Large client-side components like the `react-pdf` viewer are dynamically imported, significantly reducing the initial page load for the dashboard and search views.
- **Optimized Search**: Uses Google Drive's native `fullText` search capabilities combined with indexed database metadata for fast, comprehensive results.

### Security & Reliability
- **Header Encoding**: User metadata (name, email, groups) is Base64 encoded when passed from the Next.js middleware to the BFF. This prevents header-injection vulnerabilities and safely handles Unicode/special characters in user names.
- **Unified Error Handling**: A global JSON error handler in the BFF ensures that all API failures return consistent, helpful responses to the frontend.
- **Proxy Body Integrity**: Next.js API routes use `duplex: 'half'` streaming for POST requests, ensuring multipart/form-data (uploads) is forwarded correctly without corruption.

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
│   │   │   │   │   └── [spaceId]/
│   │   │   │   │       ├── documents/        # Default folder & section pages
│   │   │   │   │       ├── events/           # Event detail pages & agenda tool
│   │   │   │   │       └── calendar/         # Space calendar
│   │   │   │   ├── search/     # Unified search results
│   │   │   │   └── admin/      # Admin dashboard (portal_admin only)
│   │   │   └── api/            # Next.js API routes (streaming proxies to BFF)
│   │   ├── components/
│   │   │   ├── layout/         # Shell, Sidebar, SpaceNav, MobileHeader
│   │   │   ├── documents/      # DocumentList, PDFViewer, UploadButton
│   │   │   ├── calendar/       # CalendarWidget, EventCard
│   │   │   └── admin/          # AdminShell (CRUD + Audit View)
│   │   └── lib/
│   │   │   ├── auth.ts         # getUser() — decodes user from headers
│   │   │   └── api-client.ts   # Typed BFF fetch wrapper
│   │   └── middleware.ts       # Auth guard & User header injection
│   │
│   └── bff/                    # Backend for Frontend (Express)
│       └── src/
│           ├── routes/
│           │   ├── auth.ts      # OIDC flow & session lifecycle
│           │   ├── documents.ts # List, download, upload (streaming)
│           │   ├── events.ts    # Meeting doc linking & agenda management
│           │   ├── search.ts    # Unified Drive + calendar search
│           │   └── admin.ts     # CRUD + Audit retrieval + Backup/Restore
│           └── services/
│               ├── drive.ts     # Google Drive Service Account client
│               ├── db.ts        # Knex migrations & Audit Log service
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
```

### `apps/web/.env.local`

```env
# BFF base URL — server-side only, never exposed to the browser
BFF_URL=http://localhost:3001

# Public app name
NEXT_PUBLIC_APP_NAME=Quorum

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

## Admin: Configuring Spaces & System Health

Log in with a Keycloak account in the `portal_admin` group, then navigate to `/admin`.

### Space & Section Configuration
A **Space** represents a governance group (e.g. "Management Board"). Each space maps a Keycloak group to a Google Drive folder. **Sections** subdivide documents into categories like "Agendas" or "Papers".

### Audit Logs
The **Audit Log** tab provides a real-time feed of all modifications:
- **Who**: Unique Keycloak identifier and display name.
- **Action**: Categorised actions (e.g., `CREATE_SPACE`, `UPLOAD_DOCUMENT`, `DELETE_EVENT_AGENDA`).
- **Details**: Click the **Info** icon to view the exact JSON payload of the change.

### Backup & Restore
Admins can **Export** the entire portal configuration as a JSON file and **Import** it to restore or migrate settings.

---

## Security Notes

- **Credential Isolation**: Keycloak secrets and Google SA keys never leave the BFF environment.
- **No Direct Drive Links**: All documents are streamed via proxy to avoid exposing pre-signed URLs or requiring users to access Google domains directly.
- **RBAC Enforcement**: Permissions (Read, Upload, Admin) are validated at the BFF layer using the signed `groups` claim.
- **Header Integrity**: User metadata is Base64 encoded in internal headers to prevent injection and safely handle special characters.
- **Google Doc Proxying**: Google Docs linked to events are exported as PDF by the BFF, bypassing firewall restrictions for users unable to access Google domains.
