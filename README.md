# Quorum — An Online Governance Portal

A bespoke governance portal replacing use of services like Atlassian Confluence for an organisation's governance bodies. Built for multiple devices with a nod to iPad use, with Keycloak SSO, Google Drive document surfacing, and role-based access control.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Repository Structure](#repository-structure)
4. [Keycloak Setup](#keycloak-setup)
5. [Google Cloud Setup](#google-cloud-setup)
6. [Environment Variables](#environment-variables)
7. [Local Development](#local-development)
8. [Admin: Configuring Spaces](#admin-configuring-spaces)
9. [Deployment](#deployment)

---

## Architecture Overview

```
Browser / iPad
      │
      ▼
Next.js web app (port 3000)
  · App Router SSR pages
  · Middleware: validates session on every request
  · API routes: thin proxies to BFF (no direct browser→BFF calls)
      │
      ▼
BFF / Backend-for-Frontend (port 3001)
  · Express server
  · Manages Keycloak OIDC tokens (never exposed to browser)
  · Calls Google APIs via Service Account (credentials never in browser)
  · Stores space/section config in SQLite (dev) or PostgreSQL (prod)
      │
      ├──► Keycloak (snoauth.ihtsdotools.org) — OIDC auth
      ├──► Google Drive API — list & stream documents
      ├──► Google Calendar API — upcoming meetings
      └──► SQLite / PostgreSQL — space configuration
```

**Security principle:** Keycloak tokens and Google Service Account credentials never leave the BFF. The browser only holds an httpOnly session cookie.

---

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- Access to a **Keycloak** realm with admin rights
- A **Google Cloud** project with Drive API and Calendar API enabled
- A Google Cloud **Service Account** with domain-wide delegation (or shared Drive access)

---

## Repository Structure

```
quorum/
├── apps/
│   ├── web/                    # Next.js 15 frontend
│   │   ├── app/                # App Router pages
│   │   │   ├── (auth)/         # Login redirect, callback
│   │   │   ├── (portal)/       # Protected pages (dashboard, spaces, admin)
│   │   │   └── api/            # Next.js API routes (proxy to BFF)
│   │   ├── components/         # React components
│   │   ├── lib/
│   │   │   ├── auth.ts         # Session helpers, group checks
│   │   │   └── api-client.ts   # Typed BFF fetch wrapper
│   │   └── middleware.ts        # Auth guard on all portal routes
│   │
│   └── bff/                    # Backend for Frontend (Express)
│       └── src/
│           ├── routes/
│           │   ├── auth.ts      # /auth/login, /auth/callback, /auth/logout
│           │   ├── documents.ts # /documents/:spaceId — list & stream
│           │   └── admin.ts     # /admin — CRUD for spaces/sections
│           └── services/
│               ├── keycloak.ts  # OIDC token exchange & verification
│               ├── drive.ts     # Google Drive Service Account client
│               └── db.ts        # Knex + SQLite/Postgres config store
│
└── packages/
    └── types/                  # Shared TypeScript types
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
   - ✅ **Client authentication** (this makes it a confidential client — required for server-side token exchange)
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
| `portal_admin` | Full admin dashboard access |
| `secretariat` | (Optional) Document upload permission |
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

The BFF uses a **Service Account** with the Google Drive API (and optionally Calendar API) to list and stream documents. The service account credentials are only ever held in the BFF environment — they never reach the browser.

### 1. Create or Select a Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (e.g. `org-quorum`) or select an existing one
3. Note the **Project ID** — this is your `GOOGLE_PROJECT_ID`

### 2. Enable Required APIs

1. Go to **APIs & Services** → **Library**
2. Search for and enable:
   - **Google Drive API**
   - **Google Calendar API** (for Phase 5, if using calendar integration)

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

The JSON file looks like:

```json
{
  "type": "service_account",
  "project_id": "org-quorum",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n",
  "client_email": "quorum-drive-reader@org-quorum.iam.gserviceaccount.com",
  "client_id": "...",
  ...
}
```

From this file, extract:

- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → `GOOGLE_PRIVATE_KEY` (see formatting note below)
- `project_id` → `GOOGLE_PROJECT_ID`

### 5. Grant Drive Folder Access

The service account needs read access to each Google Drive folder you want to surface in the portal. **Do this for every folder you map to a space or section.**

1. Open **Google Drive** as an admin
2. Right-click the folder → **Share**
3. Add the service account email (e.g. `quorum-drive-reader@org-quorum.iam.gserviceaccount.com`)
4. Set permission to **Viewer**
5. Untick "Notify people" → **Share**

> **Shared Drives:** If your documents are in a Shared Drive (Team Drive), add the service account as a member of the Shared Drive with **Viewer** or **Content manager** access instead.

### 6. Get Folder IDs

To find a folder's ID:
1. Open the folder in Google Drive
2. The URL will be: `https://drive.google.com/drive/folders/<FOLDER_ID>`
3. Copy the `FOLDER_ID` — you'll enter this in the Admin dashboard when creating spaces/sections

### 7. Format the Private Key for .env

The private key in the JSON file contains literal newlines. In a `.env` file, you must escape them as `\n` on a single line:

```bash
# In the JSON file, the key contains actual newlines:
# "private_key": "-----BEGIN RSA PRIVATE KEY-----\nMIIEo...\n-----END RSA PRIVATE KEY-----\n"

# In .env.local, put it all on one line with literal \n:
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEo...\n-----END RSA PRIVATE KEY-----\n"
```

The BFF automatically converts `\n` back to real newlines at runtime:
```typescript
const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
```

**Quick extraction command** (from the downloaded JSON key file):

```bash
# Extract and format the private key for .env
python3 -c "
import json, sys
with open('service-account-key.json') as f:
    data = json.load(f)
print('GOOGLE_SERVICE_ACCOUNT_EMAIL=' + data['client_email'])
print('GOOGLE_PROJECT_ID=' + data['project_id'])
# Escape newlines for .env
key = data['private_key'].replace('\n', '\\\\n')
print('GOOGLE_PRIVATE_KEY=\"' + key + '\"')
"
```

### 8. (Optional) Google Calendar Access

If you want to surface calendar events in the portal:

1. Share each Google Calendar with the service account email (with **View events** permission)
2. Or, if using Google Workspace, enable **Domain-wide Delegation** on the service account and grant the Calendar API scope `https://www.googleapis.com/auth/calendar.readonly`
3. Note the **Calendar ID** (found in Google Calendar → Settings → Integrations) for each calendar you want to link to a space

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
```

---

## Local Development

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Create env files (see above)
cp apps/bff/.env.example apps/bff/.env.local   # then fill in values
cp apps/web/.env.example apps/web/.env.local

# 3. Start both services concurrently
pnpm dev
#  → Next.js:  http://localhost:3000
#  → BFF:      http://localhost:3001

# Or start individually:
pnpm --filter bff dev
pnpm --filter web dev
```

On first startup the BFF automatically creates the SQLite database and runs schema migrations. No separate migration command is needed in development.

**Without Google credentials configured**, the app runs in **mock mode** — Drive returns sample documents and downloads serve a placeholder PDF. This lets you develop and test the UI without real credentials.

### Useful Commands

```bash
# Type-check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Build for production
pnpm build

# Seed the database with example spaces (if a seed script exists)
pnpm --filter bff seed
```

---

## Admin: Configuring Spaces

Once running, log in with a Keycloak account that belongs to the `portal_admin` group, then navigate to `/admin`.

### Create a Space

A **Space** represents a governance group (e.g. "Management Board"). Each space maps to:
- A **Keycloak group** — controls who can see it
- A **Google Drive folder ID** — the default document folder

Fields:
| Field | Description |
|---|---|
| ID | URL-safe slug, e.g. `board` |
| Name | Display name, e.g. `Management Board` |
| Description | Optional subtitle |
| Keycloak Group | Exact group name/path from Keycloak, e.g. `/board-members` |
| Drive Folder ID | Paste from Google Drive folder URL |
| Calendar ID | Optional Google Calendar ID for the meetings panel |
| Category | Groups spaces in the sidebar, e.g. `Board Level` |
| Sort Order | Numeric ordering within category |

### Create Document Sections

A **Section** subdivides a space's documents into named categories, each backed by a separate Drive folder (e.g. "Agendas", "Minutes & Resolutions", "Board Papers").

1. Expand a space in the admin list
2. Click **Add Section**
3. Fields:
   | Field | Description |
   |---|---|
   | ID | Slug within the space, e.g. `agendas` |
   | Name | Display name, e.g. `Agendas` |
   | Description | Optional |
   | Drive Folder ID | Separate Drive folder for this category |
   | Sort Order | Display order within the space |

When sections are configured, the space landing page shows them as a prominent navigation grid. Without sections, a flat document list is shown instead.

---

## Deployment

> Phase 10 — full deployment guide to follow. Summary:

```
Local dev
  └──► Docker Compose (web + bff + postgres)
         └──► AWS ECS Fargate
                · web container  → port 3000
                · bff container  → port 3001
                · ALB: /* → web, /api/* → bff
              AWS RDS (PostgreSQL)
              AWS Secrets Manager (Google SA key + Keycloak secret)
              AWS S3 (Official Record PDF archives)
```

For production, set `SESSION_COOKIE_SECURE=true` (cookies sent only over HTTPS) and replace `DATABASE_URL` with a PostgreSQL connection string.

---

## Security Notes

- **Keycloak tokens** are held exclusively in the BFF session store — they are never sent to the browser.
- **Google Service Account** credentials are BFF-only env vars — never use `NEXT_PUBLIC_` prefixes for anything sensitive.
- **File downloads** are streamed through the BFF — no pre-signed Drive URLs are issued to the browser.
- **RBAC** is enforced server-side from the `groups` claim in the Keycloak ID token. Client-supplied group claims are never trusted.
- **Admin routes** (`/admin`, `/api/admin/*`) require both authentication and `portal_admin` group membership, enforced at the BFF middleware layer.
