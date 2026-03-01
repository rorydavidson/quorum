# Quorum — SNOMED International Governance Portal — CLAUDE.md

> This file is the authoritative project blueprint. Read it at the start of every session.

---

## Project Overview

A bespoke governance portal for **SNOMED International** replacing Atlassian Confluence.
Primary goal: a clean, professional, **iPadOS-optimised** interface for board members to access agendas, documents, and calendars — driven by Keycloak SSO and Google Drive.

**Key pain points being solved:**
- Confluence is broken/degraded on iPadOS (primary board device)
- Confluence's wiki UX is inappropriate for governance/board contexts
- No unified search across documents, meetings, and archives
- No clean RBAC tied to existing Keycloak groups

---

## Hard Rules
- Never install a new dependency without asking first
- Never modify the database schema without showing the migration plan
- Always produce unit tests wherever applicable
- Always consider performance and volume impact so the app can scale if necessary
- Environment variables go in .env.local, never hardcoded
  (I will find you and I will revert you)

## Patterns
- Use server components by default, client components only when interactivity is required
- Error boundaries on every route segment
- Zod validation on every user input
- Privacy-first design leaning on other services to hold key private data

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router) | SSR, file-based routing, React ecosystem |
| BFF | Node.js + Express | Proxies Keycloak tokens & Google APIs server-side |
| Auth | Keycloak OIDC | Existing SNOMED SSO (`snoauth.ihtsdotools.org`) |
| Drive integration | Google Drive API (Service Account) | Read/list/proxy documents |
| Calendar | Google Calendar API | Upcoming meetings per group |
| Forum | Discourse public API (forums.snomed.org) | Recent topics per space, no auth required |
| Search | Google Drive search API (phase 1), AWS OpenSearch (phase 2) | Unified search |
| Local DB | SQLite (dev) / PostgreSQL (prod) | Admin config: group→Drive/Calendar/Discourse mappings |
| PDF Viewer | react-pdf (PDF.js) | In-portal viewer, avoids iPadOS app redirects |
| Styling | Tailwind CSS + shadcn/ui | Customised to SNOMED brand |
| Package manager | pnpm | Monorepo support, disk efficiency |
| Hosting | AWS ECS Fargate + S3 | Scalable |

---

## Repository Structure

```
quorum/
├── apps/
│   ├── web/                    # Next.js 14 frontend
│   │   ├── app/                # App Router pages
│   │   │   ├── (auth)/         # Login redirect, callback
│   │   │   ├── (portal)/       # Protected portal pages
│   │   │   │   ├── dashboard/  # Home: calendar + recent docs
│   │   │   │   ├── spaces/     # Document spaces per group
│   │   │   │   │   └── [spaceId]/
│   │   │   │   ├── search/     # Unified search results
│   │   │   │   └── admin/      # Admin dashboard (portal_admin only)
│   │   │   └── api/            # Next.js API routes (thin proxies to BFF)
│   │   ├── components/
│   │   │   ├── layout/         # Shell, Sidebar, Header, MobileNav
│   │   │   ├── documents/      # DocumentList, DocumentCard, PDFViewer modal
│   │   │   ├── calendar/       # CalendarWidget, EventCard
│   │   │   ├── forum/          # ForumWidget — Discourse topics per space
│   │   │   ├── search/         # SearchBar, SearchResults
│   │   │   └── admin/          # SpaceMapping, CalendarMapping forms
│   │   ├── lib/
│   │   │   ├── auth.ts         # Session helpers, group extraction
│   │   │   └── api-client.ts   # Typed fetch wrapper for BFF calls
│   │   ├── middleware.ts        # Next.js middleware: auth guard on all /portal routes
│   │   └── public/
│   │       └── snomed-logo.png
│   │
│   └── bff/                    # Backend for Frontend (Node.js/Express)
│       ├── src/
│       │   ├── routes/
│       │   │   ├── auth.ts      # /auth/login, /auth/callback, /auth/logout, /auth/session
│       │   │   ├── documents.ts # /documents/:spaceId — list & proxy
│       │   │   ├── calendar.ts  # /calendar — upcoming events (by spaceId or aggregate)
│       │   │   ├── forum.ts     # /forum — Discourse topics (by spaceId or aggregate)
│       │   │   ├── search.ts    # /search — unified search
│       │   │   └── admin.ts     # /admin — CRUD for space/calendar/discourse mappings
│       │   ├── services/
│       │   │   ├── keycloak.ts  # OIDC token exchange, JWKS verification
│       │   │   ├── drive.ts     # Google Drive Service Account client
│       │   │   ├── calendar.ts  # Google Calendar Service Account client
│       │   │   ├── discourse.ts # Discourse public API client (mock-aware)
│       │   │   └── db.ts        # Knex/better-sqlite3 — space config store
│       │   ├── middleware/
│       │   │   ├── requireAuth.ts  # Validate session cookie
│       │   │   └── requireAdmin.ts # Check portal_admin group
│       │   └── index.ts
│       └── .env.local          # (gitignored) BFF secrets
│
├── packages/
│   └── types/                  # Shared TypeScript interfaces
│       └── src/
│           └── index.ts        # DriveFile, CalendarEvent, SpaceConfig, User, etc.
│
├── CLAUDE.md                   # ← you are here
├── plan.md                     # Phased implementation roadmap
├── pnpm-workspace.yaml
├── package.json                # Root: workspace scripts
├── snomed-logo.png
└── .gitignore
```

---

## Development Commands

```bash
# Install all workspace dependencies
pnpm install

# Run frontend (Next.js) — http://localhost:3000
pnpm --filter web dev

# Run BFF — http://localhost:3001
pnpm --filter bff dev

# Run both concurrently from root
pnpm dev

# Type check all packages
pnpm typecheck

# Lint all
pnpm lint

# Build all for production
pnpm build
```

---

## Architecture

### Request Flow

```
Browser / iPad
     │
     ▼
Next.js (port 3000)
  - App Router pages (SSR/CSR)
  - middleware.ts: checks BFF /auth/session on every request
  - API routes: thin proxy to BFF (avoids CORS, forwards session cookie)
     │
     ▼
BFF (port 3001)
  - Express server
  - Session stored in signed httpOnly cookie (iron-session or express-session + Redis)
  - Validates Keycloak JWT on every request
  - Calls Google APIs using Service Account (never exposed to browser)
  - Reads space/calendar config from SQLite/Postgres
     │
     ├──► Keycloak (snoauth.ihtsdotools.org)
     │      OIDC authorization_code flow
     │
     ├──► Google Drive API
     │      Service Account, list files, stream downloads
     │
     ├──► Google Calendar API
     │      Service Account, list events per calendar ID
     │
     ├──► Discourse public API (forums.snomed.org)
     │      No auth — public categories; graceful degradation on failure
     │
     └──► SQLite / Postgres
            Admin config: group → Drive folder ID
                          group → Calendar ID
                          group → Discourse category slug
                          hierarchy definitions
```

### Auth Flow (OIDC Authorization Code)

```
1. User hits portal → Next.js middleware detects no session
2. Redirect to: GET /auth/login (BFF)
3. BFF builds Keycloak authorize URL and redirects user
4. User authenticates at snoauth.ihtsdotools.org
5. Keycloak redirects to: GET /auth/callback?code=XXX (BFF)
6. BFF exchanges code for tokens (ID + access + refresh)
7. BFF extracts groups claim from ID token
8. BFF sets httpOnly session cookie (contains: userId, email, name, groups, expiresAt)
9. BFF redirects user to /dashboard
10. All subsequent requests: Next.js reads session via BFF /auth/session
```

### RBAC Model

| Keycloak Group | Access |
|---|---|
| Any authenticated user | Their own spaces (groups they belong to) |
| `portal_admin` | Admin dashboard + all spaces |
| `secretariat` (or defined per space) | Upload permission to mapped Drive folder |

---

## Design System

### Brand Colours (from SNOMED logo)

```
Primary Blue:   #009FE3   (SNOMED cyan-blue — primary actions, nav accent)
Dark Grey:      #4D5057   (body text, secondary elements)
Light Grey:     #F5F6F7   (page background)
White:          #FFFFFF   (card backgrounds)
Border:         #E2E4E7   (subtle separators)
Danger:         #DC2626   (errors, destructive actions)
```

### Typography

- Font: `Inter` (Google Fonts) — clean, professional, excellent on Retina/iPad
- Headings: `font-semibold`, scale: `text-2xl` → `text-sm`
- Body: `text-base` / `text-sm`, colour `#4D5057`

### Component Conventions

- **Touch targets:** Minimum 44×44px on all interactive elements (iOS HIG)
- **No hover-only states:** All interactions must work on touch
- **Cards:** White background, 1px border `#E2E4E7`, `rounded-lg`, `shadow-sm`
- **Sidebar:** Collapsible on mobile/tablet. Tab bar on mobile (<768px)
- **Modals:** Full-screen on mobile; centred overlay (max-w-4xl) on desktop
- **PDF Viewer:** Full-screen modal with toolbar (page nav, zoom, download)

### shadcn/ui Components to Use

- `Button`, `Input`, `Select`, `Dialog` (PDF viewer modal)
- `Table` (document listing), `Badge` (document type/status)
- `Sheet` (mobile nav drawer), `Tabs` (space sub-navigation)
- `Command` (search command palette, ⌘K)

---

## Security Rules

> These rules must be followed in every implementation session.

1. **Keycloak tokens NEVER reach the browser.** BFF only.
2. **Google Service Account credentials NEVER in frontend env vars.** `apps/bff/.env.local` only.
3. **All BFF routes require `requireAuth` middleware** except `/auth/login`, `/auth/callback`, `/health`.
4. **Admin routes require both `requireAuth` AND `requireAdmin` middleware.**
5. **File downloads proxied through BFF** — never issue pre-signed URLs with long expiry to the browser.
6. **Session cookies:** `httpOnly: true`, `secure: true` (prod), `sameSite: 'lax'`.
7. **RBAC enforced server-side:** Group membership from Keycloak ID token, not client-supplied.
8. **Input validation:** All admin form inputs validated with Zod on BFF before DB write.
9. **No CORS wildcards:** BFF CORS origin locked to Next.js origin only.
10. **No sensitive data in Next.js `NEXT_PUBLIC_` env vars.**

---

## Environment Variables

### `apps/bff/.env.local`

```env
# Server port
PORT=3001

# Keycloak OIDC
KEYCLOAK_URL=https://snoauth.ihtsdotools.org
KEYCLOAK_REALM=snomed
KEYCLOAK_CLIENT_ID=quorum
KEYCLOAK_CLIENT_SECRET=<secret>
KEYCLOAK_REDIRECT_URI=http://localhost:3001/auth/callback

# Session
SESSION_SECRET=<32+ char random string>
SESSION_COOKIE_NAME=quorum_session

# Google APIs (Service Account JSON — escape newlines)
GOOGLE_SERVICE_ACCOUNT_EMAIL=<sa>@<project>.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GOOGLE_PROJECT_ID=<gcp-project-id>

# Database (SQLite for local dev)
DATABASE_URL=file:./dev.db
# DATABASE_URL=postgresql://user:pass@host:5432/quorum  (prod)

# Frontend origin (for CORS)
FRONTEND_ORIGIN=http://localhost:3000

# Discourse forum base URL (override per environment if using a staging forum)
DISCOURSE_URL=https://forums.snomed.org
# DISCOURSE_MOCK=true   # uncomment to use hardcoded mock data (set automatically in tests)

# Discourse API credentials — only required for private/restricted categories.
# Leave unset for fully public forums (no auth needed).
# Setup: Discourse Admin → API → New API Key; add DISCOURSE_API_USERNAME to all private groups.
# DISCOURSE_API_KEY=<discourse-api-key>
# DISCOURSE_API_USERNAME=quorum-system
```

### `apps/web/.env.local`

```env
# BFF URL (server-side only — NOT NEXT_PUBLIC_)
BFF_URL=http://localhost:3001

# Public-safe config only
NEXT_PUBLIC_APP_NAME=Quorum
NEXT_PUBLIC_KEYCLOAK_REALM=snomed

# Discourse forum base URL — used by ForumWidget (server component) to build category links.
# Must match the BFF value. Override per environment if using a staging forum.
DISCOURSE_URL=https://forums.snomed.org
```

---

## Shared Types (`packages/types/src/index.ts`)

Key interfaces to define from day one:

```typescript
// User session (from Keycloak ID token)
interface SessionUser {
  sub: string;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  groups: string[];
}

// Space configuration (stored in DB)
interface SpaceConfig {
  id: string;
  name: string;
  description?: string;
  keycloakGroup: string;           // e.g. "/board-members"
  driveFolderId: string;           // Google Drive folder ID
  calendarId?: string;             // Google Calendar ID
  icalUrl?: string;                // iCal feed URL (alternative to Google Calendar)
  discourseCategorySlug?: string;  // e.g. "board-members" — forum widget shown when set
  hierarchyCategory: string;       // e.g. "Board Level", "Working Groups"
  uploadGroups: string[];          // groups allowed to upload
  sortOrder: number;
}

// Discourse forum topic (from forums.snomed.org public API)
interface DiscoursePost {
  id: number;
  title: string;
  slug: string;
  postsCount: number;
  replyCount: number;
  views: number;
  createdAt: string;       // ISO 8601
  lastPostedAt: string;    // ISO 8601
  url: string;             // https://forums.snomed.org/t/{slug}/{id}
}

// Document listing entry
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  createdTime: string;
  modifiedTime: string;
  webViewLink?: string;
  isOfficialRecord: boolean;
}

// Calendar event
interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;  // ISO 8601
  end: string;
  location?: string;
  htmlLink?: string;
  spaceId: string;
  spaceName: string;
}

// Search result (union)
type SearchResult =
  | { type: 'file'; data: DriveFile; spaceId: string; spaceName: string }
  | { type: 'event'; data: CalendarEvent }
  | { type: 'archive'; data: DriveFile; spaceId: string; spaceName: string };
```

---

## Implementation Phases

See `plan.md` for detailed tasks per phase. Summary:

| Phase | Name | Status |
|---|---|---|
| 1 | Monorepo scaffolding | `[x] DONE` |
| 2 | Auth layer (Keycloak OIDC) | `[x] DONE` |
| 3 | Core UI shell | `[x] DONE` |
| 4 | Document spaces (Drive) | `[x] DONE` |
| 5 | Calendar widget | `[x] DONE` |
| 6 | Unified search | `[x] DONE` |
| 7 | Admin dashboard | `[x] DONE` |
| 8 | Official Records / Snapshots | `[x] DONE` |
| 9 | Upload functionality | `[x] DONE` |
| 10 | Discourse forum widget per space | `[x] DONE` |
| 11 | AWS deployment | `[ ] TODO` |

**Update this table as phases complete.**

---

## Testing Strategy

- **Unit tests:** `vitest` for BFF services (Drive, Calendar, Keycloak token parsing)
- **Component tests:** `@testing-library/react` for key UI components (PDFViewer, DocumentList)
- **Integration tests:** BFF route tests with `supertest` + mocked Google APIs
- **E2E:** `Playwright` — auth flow, document listing, PDF viewer open/close
- **iPad testing:** Playwright device emulation (`iPad Pro`) for touch/layout verification

---

## Deployment (Future Phase 11)

```
Local dev  →  Docker Compose (web + bff + postgres)
           →  AWS ECS Fargate
                 - Task: web container (Next.js, port 3000)
                 - Task: bff container (Express, port 3001)
                 - ALB routing: /* → web, /api/* → bff
              AWS RDS (PostgreSQL) for config store
              AWS S3 for Official Record PDF archives
              AWS Secrets Manager for Google SA key + Keycloak secret
```

---

## Key Conventions for Claude Sessions

- Always run `pnpm typecheck` and `pnpm lint` before considering a task complete.
- Prefer server components in Next.js App Router; use `'use client'` only when needed (event handlers, state, browser APIs).
- BFF routes follow REST conventions: `GET /documents/:spaceId`, `GET /documents/:spaceId/:fileId/download`.
- Error responses from BFF: `{ error: string, code: string }` with appropriate HTTP status.
- All dates in ISO 8601. Display formatting happens in the frontend only.
- Commit messages: conventional commits format (`feat:`, `fix:`, `chore:`, `docs:`).
