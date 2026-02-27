# Quorum — SNOMED Governance Portal — Implementation Plan

> Read CLAUDE.md first for architecture, types, and conventions.
> Update the status column in CLAUDE.md as each phase completes.

---

## Phase 1: Monorepo Scaffolding

**Goal:** Working pnpm monorepo with both apps booting and TypeScript compiling.

### Tasks

- [ ] Create `pnpm-workspace.yaml` declaring `apps/*` and `packages/*`
- [ ] Create root `package.json` with workspace scripts: `dev`, `build`, `typecheck`, `lint`
- [ ] Scaffold `apps/web` with `create-next-app` (TypeScript, App Router, Tailwind, no src/)
  - Configure `tailwind.config.ts` with SNOMED brand colours (extend theme)
  - Install: `shadcn/ui`, `lucide-react`, `react-pdf`, `@tanstack/react-query`
  - Delete boilerplate (page.tsx, globals.css default content)
- [ ] Scaffold `apps/bff` as a bare Node.js/TypeScript Express project
  - Install: `express`, `express-session`, `cors`, `zod`, `googleapis`, `openid-client`, `knex`, `better-sqlite3`
  - Install dev: `tsx`, `@types/express`, `@types/express-session`, `@types/better-sqlite3`
  - Create `src/index.ts` with health route `GET /health → { status: 'ok' }`
- [ ] Create `packages/types/` with shared interfaces (from CLAUDE.md Types section)
- [ ] Configure TypeScript path aliases (`@snomed/types`) in both apps
- [ ] Add `.gitignore` entries: `node_modules`, `.env.local`, `*.db`, `.next`, `dist`
- [ ] Verify: `pnpm dev` starts both apps; `pnpm typecheck` passes clean

---

## Phase 2: Auth Layer (Keycloak OIDC)

**Goal:** Full Keycloak auth flow working end-to-end. Session cookie set. Middleware protecting all portal routes.

### BFF — Keycloak Service (`apps/bff/src/services/keycloak.ts`)

- [ ] Initialise `openid-client` with Keycloak OIDC discovery URL
  - `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`
- [ ] Store `client` instance (singleton, initialised at startup)
- [ ] Helper: `exchangeCodeForTokens(code, state)` → `{ idToken, accessToken, refreshToken }`
- [ ] Helper: `parseIdToken(idToken)` → `SessionUser` (extract sub, email, name, groups)
- [ ] Helper: `refreshAccessToken(refreshToken)` → new tokens

### BFF — Auth Routes (`apps/bff/src/routes/auth.ts`)

- [ ] `GET /auth/login` — generate state, store in session, redirect to Keycloak authorize URL
  - Scopes: `openid profile email groups`
- [ ] `GET /auth/callback` — validate state, exchange code, parse ID token, write session, redirect to `/`
- [ ] `GET /auth/logout` — clear session, redirect to Keycloak logout endpoint
- [ ] `GET /auth/session` — return current session user (no tokens) or 401

### BFF — Session Middleware

- [ ] Configure `express-session` with:
  - `secret`: `SESSION_SECRET` env var
  - `cookie`: `httpOnly: true`, `secure: false` (dev), `sameSite: 'lax'`, `maxAge: 8h`
  - Store: `MemoryStore` (dev) — note: replace with Redis in prod
- [ ] `requireAuth` middleware: check `req.session.user` exists → 401 if not
- [ ] `requireAdmin` middleware: check `req.session.user.groups.includes('portal_admin')` → 403

### Next.js — Middleware (`apps/web/middleware.ts`)

- [ ] On every request to `/(portal)/*`:
  - Call BFF `GET /auth/session` (server-side fetch)
  - If 401 → redirect to `/auth/login` (which hits BFF → Keycloak)
  - If 200 → set user in request headers (for layout server components)
- [ ] Exclude from middleware: `/`, `/api/auth/*`, `/_next/*`, `/favicon.ico`, static assets

### Next.js — API Route Proxy (`apps/web/app/api/auth/[...route]/route.ts`)

- [ ] Proxy `/api/auth/login` → BFF `/auth/login`
- [ ] Proxy `/api/auth/callback` → BFF `/auth/callback`
- [ ] Proxy `/api/auth/logout` → BFF `/auth/logout`

### Verify

- [ ] Navigate to `http://localhost:3000` → redirected to Keycloak login
- [ ] Login with test account → redirected to `/dashboard`
- [ ] `GET http://localhost:3001/auth/session` returns user JSON
- [ ] Non-`portal_admin` user hits `/admin` → 403

---

## Phase 3: Core UI Shell

**Goal:** Full app layout with SNOMED branding, responsive sidebar nav, working on iPad.

### Layout Architecture

```
app/(portal)/layout.tsx
  └── <Shell>
        ├── <Sidebar>        (desktop: fixed left 240px)
        │     ├── SNOMED logo
        │     ├── Nav items (spaces, calendar, search, admin)
        │     └── User avatar + logout
        ├── <MobileHeader>   (tablet/mobile: top bar + hamburger)
        │     └── opens <NavDrawer> (Sheet component)
        └── <main>           (content area)
```

### Components to Build

- [ ] `components/layout/Shell.tsx` — flex container, sidebar + main
- [ ] `components/layout/Sidebar.tsx`
  - SNOMED logo (top, links to `/dashboard`)
  - Nav items: Dashboard, Spaces (expandable by category), Search, Admin (conditional)
  - User section: avatar initials, name, email, Logout button
  - Highlight active route
- [ ] `components/layout/MobileHeader.tsx` — top bar with logo + hamburger on `md:hidden`
- [ ] `components/layout/NavDrawer.tsx` — Sheet wrapping sidebar nav for mobile
- [ ] `app/(portal)/dashboard/page.tsx` — placeholder "Dashboard" heading
- [ ] `app/(portal)/spaces/[spaceId]/page.tsx` — placeholder
- [ ] `app/(portal)/search/page.tsx` — placeholder
- [ ] `app/(portal)/admin/page.tsx` — placeholder (admin-only guard)

### Tailwind Config Extensions

```typescript
// tailwind.config.ts extend.colors
snomed: {
  blue:       '#009FE3',
  'blue-dark': '#0080C0',
  grey:       '#4D5057',
  'grey-light': '#F5F6F7',
  border:     '#E2E4E7',
}
```

### iPadOS Checklist

- [ ] All nav items: `min-h-[44px]` touch targets
- [ ] Sidebar collapses at `<1024px` (not just `<768px` — iPads are 1024px landscape)
- [ ] No `hover:` only interactions — all use `active:` or explicit tap
- [ ] Sidebar nav uses `<button>` or `<Link>` (not `<div onClick>`)
- [ ] Test layout at 1024×1366 (iPad Pro 12.9" landscape)

### Verify

- [ ] Logo renders in sidebar
- [ ] Nav links work (no 404 on placeholder pages)
- [ ] Mobile hamburger opens drawer and closes on nav
- [ ] No horizontal scroll at 768px width
- [ ] Admin nav item hidden for non-admin users

---

## Phase 4: Document Spaces (Google Drive)

**Goal:** Spaces list, document listing per space with metadata, PDF viewer modal.

### BFF — Drive Service (`apps/bff/src/services/drive.ts`)

- [ ] Initialise Google Drive client with Service Account credentials
  - Use `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` env vars
  - Scopes: `https://www.googleapis.com/auth/drive.readonly` (plus `.file` for uploads later)
- [ ] `listFiles(folderId: string)` → `DriveFile[]`
  - Fields: `id, name, mimeType, size, createdTime, modifiedTime, webViewLink`
  - Filter: `parents in '${folderId}' and trashed = false`
  - Sort: `modifiedTime desc`
  - Mark `isOfficialRecord: true` if name contains `_OFFICIAL_RECORD_`
- [ ] `getFileMetadata(fileId: string)` → `DriveFile`
- [ ] `downloadFile(fileId: string)` → `ReadableStream` (for proxying to browser)

### BFF — DB Service (`apps/bff/src/services/db.ts`)

- [ ] Initialise Knex with SQLite (dev) or Postgres (prod) from `DATABASE_URL`
- [ ] Migration: create `spaces` table
  ```sql
  CREATE TABLE spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    keycloak_group TEXT NOT NULL,
    drive_folder_id TEXT NOT NULL,
    calendar_id TEXT,
    hierarchy_category TEXT NOT NULL DEFAULT 'General',
    upload_groups TEXT NOT NULL DEFAULT '[]',  -- JSON array
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  ```
- [ ] CRUD helpers: `getSpaces()`, `getSpaceById(id)`, `getSpacesByGroups(groups[])`, `upsertSpace()`, `deleteSpace()`

### BFF — Document Routes (`apps/bff/src/routes/documents.ts`)

- [ ] `GET /documents` — return spaces the user's groups have access to
- [ ] `GET /documents/:spaceId` — list files in space's Drive folder
  - Verify user's groups include the space's `keycloak_group`
- [ ] `GET /documents/:spaceId/:fileId/download` — stream file from Drive to browser
  - Set `Content-Type`, `Content-Disposition: inline` (for PDF display)
  - Verify user's groups include the space's `keycloak_group`

### Next.js — Spaces Pages

- [ ] `app/(portal)/spaces/page.tsx` — list all accessible spaces grouped by `hierarchyCategory`
  - Card per space: name, description, category badge
- [ ] `app/(portal)/spaces/[spaceId]/page.tsx` — document listing
  - Fetch from BFF `/documents/:spaceId`
  - `<DocumentList>` component

### Components

- [ ] `components/documents/DocumentList.tsx`
  - Table: Name | Type | Date Modified | Size | Actions
  - Row click → open PDF viewer modal (for PDFs); download link for others
  - `<Badge>` for `isOfficialRecord`
  - Empty state illustration
- [ ] `components/documents/DocumentCard.tsx` — mobile card view (responsive toggle)
- [ ] `components/documents/PDFViewer.tsx`
  - Full-screen `<Dialog>` (shadcn)
  - `<Document>` + `<Page>` from `react-pdf`
  - Toolbar: page back/forward, zoom in/out, download button, close
  - Touch: pinch-to-zoom (react-pdf supports this), swipe pages on mobile
  - Loading skeleton while PDF loads
  - Error state if PDF fails to load
- [ ] `components/documents/DocumentTypeIcon.tsx` — icon by mimeType

### Verify

- [ ] Spaces page lists only spaces the logged-in user's groups cover
- [ ] Document list shows files from correct Drive folder
- [ ] PDF opens in modal — no redirect to Files app on iPad simulator
- [ ] Download button downloads the file
- [ ] Non-member trying to access a space's URL → 403

---

## Phase 5: Calendar Widget

**Goal:** Dashboard shows upcoming meetings relevant to the user's groups.

### BFF — Calendar Service (`apps/bff/src/services/calendar.ts`)

- [ ] Initialise Google Calendar client with same Service Account
  - Scope: `https://www.googleapis.com/auth/calendar.readonly`
- [ ] `listEvents(calendarId: string, options: { maxResults, timeMin, timeMax })` → `CalendarEvent[]`
- [ ] `getUpcomingEvents(calendarIds: string[], limit: number)` — merge + sort events from multiple calendars

### BFF — Calendar Route (`apps/bff/src/routes/calendar.ts`)

- [ ] `GET /calendar` — return upcoming events for all calendars mapped to user's groups
  - Look up user's groups → find spaces with `calendar_id` set → fetch events → merge → sort
  - Query param: `?limit=10&days=30`

### Next.js — Dashboard

- [ ] `app/(portal)/dashboard/page.tsx`
  - Two-column layout (desktop): Calendar widget left, Recent Docs right
  - Single column on mobile/tablet
- [ ] `components/calendar/CalendarWidget.tsx`
  - List of upcoming events, grouped by date
  - Event card: title, time, space name badge, location
  - "View all" link
  - Empty state if no upcoming meetings
- [ ] `components/calendar/EventCard.tsx`
  - Touch-friendly: full-width tap target
  - Date/time formatted in user's locale
  - Space name as coloured badge

### Verify

- [ ] Dashboard shows only meetings from calendars the user's groups map to
- [ ] Events sorted chronologically
- [ ] Past events excluded
- [ ] Empty state shows friendly message if no upcoming meetings

---

## Phase 6: Unified Search

**Goal:** Single search bar (⌘K) queries Drive files, calendar events, and Official Records.

### BFF — Search Route (`apps/bff/src/routes/search.ts`)

- [ ] `GET /search?q=<query>&limit=20`
  - Determine user's accessible spaces (from groups)
  - Parallel fetch:
    1. Drive search: `fullText contains '${q}'` in each accessible folder
    2. Calendar search: filter upcoming events by title/description matching `q`
    3. Official Records: search Drive Archive folder for matching records
  - Merge results, sort by relevance (Drive gives relevance score)
  - Return typed `SearchResult[]`

### Next.js — Search

- [ ] `components/search/SearchBar.tsx`
  - Uses shadcn `<Command>` component (modal command palette)
  - Opens on ⌘K / tap search icon
  - Debounced input (300ms) → calls BFF `/search`
  - Show results grouped by type: Documents | Events | Archives
- [ ] `app/(portal)/search/page.tsx` — full search results page for deep results
- [ ] `components/search/SearchResult.tsx` — result item with type icon, title, context snippet, space badge

### Verify

- [ ] ⌘K opens search palette
- [ ] Typing returns results within 500ms
- [ ] Results correctly scoped to user's accessible spaces
- [ ] Clicking document result opens PDF viewer
- [ ] Clicking event result shows event detail

---

## Phase 7: Admin Dashboard

**Goal:** `portal_admin` users can configure space/calendar mappings and directory hierarchy.

### BFF — Admin Routes (`apps/bff/src/routes/admin.ts`)

All routes require `requireAuth` + `requireAdmin` middleware.

- [ ] `GET /admin/spaces` — list all space configs
- [ ] `POST /admin/spaces` — create space config (validate with Zod)
- [ ] `PUT /admin/spaces/:id` — update space config
- [ ] `DELETE /admin/spaces/:id` — delete space config
- [ ] `GET /admin/drive/folders` — list top-level Drive folders (to help admin pick folder ID)
- [ ] `GET /admin/calendars` — list Google Calendars accessible to service account

### Zod Schema (for admin space form)

```typescript
const SpaceConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  keycloakGroup: z.string().min(1),
  driveFolderId: z.string().min(1),
  calendarId: z.string().optional(),
  hierarchyCategory: z.string().min(1),
  uploadGroups: z.array(z.string()),
  sortOrder: z.number().int().min(0),
});
```

### Next.js — Admin Pages

- [ ] `app/(portal)/admin/page.tsx` — Admin dashboard home
  - List of configured spaces with edit/delete
  - "Add Space" button
- [ ] `app/(portal)/admin/spaces/new/page.tsx` — Create space form
- [ ] `app/(portal)/admin/spaces/[id]/edit/page.tsx` — Edit space form
- [ ] `components/admin/SpaceForm.tsx` — Form with all fields
  - Drive folder picker: show folder list from BFF, or paste ID directly
  - Calendar picker: show calendar list from BFF, or paste ID directly
  - Upload groups: multi-select from known Keycloak groups (or freeform input)
- [ ] Server-side guard: if user not in `portal_admin` group → redirect to `/dashboard`

### Verify

- [ ] Non-admin user cannot access `/admin` (server redirect, not just hidden link)
- [ ] Admin can create a space mapping (Drive folder ID + Keycloak group)
- [ ] Space immediately appears in Spaces nav for correct group members
- [ ] Deleting a space removes it from navigation

---

## Phase 8: Official Records / Snapshots

**Goal:** Admins can trigger a snapshot of a space's documents, creating an immutable archive.

### Concept

An "Official Record" is a date-stamped copy of a Drive folder's file listing, stored with a naming convention so it's easily identifiable and filterable.

### BFF — Official Records Routes (`apps/bff/src/routes/admin.ts` extension)

- [ ] `POST /admin/spaces/:id/snapshot` — trigger snapshot
  - List all current files in the space's Drive folder
  - Copy each file to the Drive "Archive" sub-folder (or S3 in Phase 10)
  - Rename with prefix: `_OFFICIAL_RECORD_YYYY-MM-DD_<original-name>`
  - Return list of created archive entries
- [ ] `GET /admin/spaces/:id/snapshots` — list all official records for a space

### Archive Storage Options

- **Phase 8 (local/dev):** Archive sub-folder within the same Drive folder
- **Phase 10 (prod):** AWS S3 bucket `snomed-governance-archives` with key pattern:
  `{spaceId}/{YYYY-MM-DD}/{original-filename}`

### Next.js — Admin Snapshot UI

- [ ] `app/(portal)/admin/spaces/[id]/page.tsx` — space detail with "Create Official Record" button
- [ ] Confirm dialog before snapshot (destructive action — immutable once created)
- [ ] List of existing official records with date badges

### Drive/Document List Integration

- [ ] `DriveFile.isOfficialRecord: true` when filename contains `_OFFICIAL_RECORD_`
- [ ] Official Records shown with distinct badge in document listing
- [ ] Filter option in document list: "Show Official Records only"

### Verify

- [ ] Admin clicks "Create Official Record" → confirmation shown → snapshot created
- [ ] Snapshot files appear in document list with `[Official Record]` badge
- [ ] Official Records appear in search results under "Archives" section

---

## Phase 9: Upload Functionality

**Goal:** Users in `uploadGroups` for a space can upload new documents directly to the mapped Drive folder.

### BFF — Upload Route

- [ ] `POST /documents/:spaceId/upload`
  - `requireAuth` middleware
  - Check user's groups include one of the space's `uploadGroups` → 403 if not
  - Receive multipart form data (using `multer`)
  - Upload to Google Drive folder using Service Account
  - Drive API: `files.create` with `media` upload
  - Return created `DriveFile`

### Next.js — Upload UI

- [ ] Upload button visible in `SpaceDocumentList` only if user is in `uploadGroups`
- [ ] `components/documents/UploadButton.tsx`
  - `<input type="file" accept=".pdf,.doc,.docx,.xlsx,.pptx">` (hidden, triggered by button)
  - Upload progress indicator
  - Success toast notification
  - Error handling (file too large, wrong type)
- [ ] File size limit: 50MB (configurable in BFF env var `MAX_UPLOAD_SIZE_MB`)
- [ ] Optimistic UI: show uploading file in list immediately, replace on success

### Verify

- [ ] Non-upload-group user sees no upload button
- [ ] Upload group member can upload PDF → appears in document list
- [ ] File actually appears in Google Drive folder
- [ ] Upload progress bar shown during large file upload
- [ ] Error shown if file type not allowed

---

## Phase 10: AWS Deployment

**Goal:** Production-ready deployment on AWS ECS Fargate.

### Infrastructure

- [ ] `Dockerfile` for `apps/web` — multi-stage build
  ```dockerfile
  FROM node:20-alpine AS base
  # ... pnpm install + next build
  FROM node:20-alpine AS runner
  # ... copy .next/standalone + public
  EXPOSE 3000
  ```
- [ ] `Dockerfile` for `apps/bff` — multi-stage build
  ```dockerfile
  FROM node:20-alpine AS builder
  # ... pnpm install + tsc build
  FROM node:20-alpine AS runner
  # ... copy dist/
  EXPOSE 3001
  ```
- [ ] `docker-compose.yml` for local full-stack testing
  ```yaml
  services:
    web:    ports: ["3000:3000"]
    bff:    ports: ["3001:3001"]
    db:     postgres:15-alpine
  ```

### AWS Resources (CDK or Terraform — decision TBD)

- [ ] **ECS Cluster** (Fargate) with two services: `web`, `bff`
- [ ] **ALB** (Application Load Balancer)
  - `/api/*` → BFF target group (port 3001)
  - `/*` → Web target group (port 3000)
- [ ] **RDS PostgreSQL** (replace SQLite)
- [ ] **S3 Bucket** `snomed-governance-archives` — Official Record storage
- [ ] **Secrets Manager** — `KEYCLOAK_CLIENT_SECRET`, `GOOGLE_PRIVATE_KEY`, `SESSION_SECRET`
- [ ] **ECR** repositories for `web` and `bff` images
- [ ] **CloudWatch** log groups for both services

### Security Hardening for Prod

- [ ] Session cookie: `secure: true` (HTTPS only)
- [ ] BFF CORS: locked to ALB domain only
- [ ] ECS task roles: minimal IAM (S3 write to archives bucket only)
- [ ] VPC: BFF and RDS in private subnet, ALB in public subnet
- [ ] WAF: AWS WAF on ALB (basic rate limiting, SQL injection rules)

### Keycloak Configuration

- [ ] Register new client in Keycloak realm `snomed`
  - Client ID: `quorum`
  - Valid redirect URIs: `https://<prod-domain>/auth/callback`
  - Add mapper: `groups` claim as array in ID token
- [ ] Update `KEYCLOAK_REDIRECT_URI` env var for prod

### Verify

- [ ] `docker compose up` → both services start, login flow works
- [ ] `docker compose up` → PDF viewer works (no CORS errors)
- [ ] AWS: health checks pass on both ECS services
- [ ] AWS: login → Keycloak → callback → session → document listing
- [ ] AWS: PDF download streams correctly through BFF → ALB → browser

---

## Cross-Cutting Concerns

### Error Handling Pattern

```typescript
// BFF routes use this pattern:
try {
  const result = await service.doThing();
  res.json(result);
} catch (err) {
  if (err instanceof KnownError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
  } else {
    logger.error(err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
}
```

### Loading States

- Use `React.Suspense` + Next.js `loading.tsx` for page-level loading
- Skeleton components for lists (not spinners — skeletons feel faster on iPad)
- `@tanstack/react-query` for client-side data fetching with stale-while-revalidate

### Accessibility

- All interactive elements keyboard-navigable
- Focus rings visible (Tailwind `focus-visible:ring-2`)
- Screen reader labels on icon-only buttons
- PDF viewer: announce page changes to screen reader

### Performance

- Next.js: Static generation where possible (space list, admin configs rarely change)
- Drive file listings: Cache in BFF for 60 seconds (in-memory or Redis)
- Images: `next/image` with proper sizing
- Bundle: Dynamically import `react-pdf` (large dependency)
  ```typescript
  const PDFViewer = dynamic(() => import('@/components/documents/PDFViewer'), { ssr: false });
  ```
