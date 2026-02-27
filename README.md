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

## Repository Structure

```
quorum/
├── apps/
│   ├── web/                    # Next.js 15 frontend
│   │   ├── app/
│   │   │   ├── (portal)/       # Protected pages (auth-guarded by middleware)
│   │   │   │   ├── dashboard/  # Home: upcoming events + space quick-links
│   │   │   │   ├── spaces/
│   │   │   │   │   └── [spaceId]/
│   │   │   │   │       ├── documents/        # Default folder & section pages
│   │   │   │   │       ├── events/           # Event detail pages & agenda tool
│   │   │   │   │       └── calendar/         # Space calendar
│   │   │   │   └── admin/      # Admin dashboard (portal_admin only)
│   │   │   └── api/            # Next.js API routes (streaming proxies to BFF)
│   │   │       └── admin/      # CRUD + Audit Log + Backup/Restore proxies
│   │   ├── components/
│   │   │   ├── layout/         # Shell, Sidebar, SpaceNav, MobileHeader
│   │   │   ├── documents/      # DocumentList, PDFViewer, UploadButton
│   │   │   ├── calendar/       # CalendarWidget, EventCard
│   │   │   └── admin/          # AdminShell (Space/Section CRUD + Audit Log View)
│   │   └── middleware.ts       # Auth guard & User header injection
│   │
│   └── bff/                    # Backend for Frontend (Express)
│       └── src/
│           ├── routes/
│           │   ├── documents.ts # List, download, upload (streaming)
│           │   ├── events.ts    # Meeting doc linking & agenda management
│           │   ├── admin.ts     # CRUD + Audit retrieval + Backup/Restore
│           └── services/
│               ├── drive.ts     # Google Drive Service Account client
│               ├── db.ts        # Knex migrations & Audit Log service
│
└── packages/
    └── types/                  # Shared types (AuditLog, EventMetadata, etc.)
```

---

## Keycloak Setup

(Sections truncated for length - follow standard SNOMED Keycloak OIDC setup with `groups` mapper)

---

## Admin: Configuring Spaces & System Health

Log in with a Keycloak account in the `portal_admin` group, then navigate to `/admin`.

### Space & Section Configuration
A **Space** represents a governance group, mapping a Keycloak group to a Google Drive folder. **Sections** further subdivide this space into categories like "Agendas" or "Papers".

### Audit Logs
The **Audit Log** tab provides a real-time, read-only trail of all modifications across the portal.
- **Who**: Displayed by name and unique Keycloak subject ID.
- **Action**: Categorised (e.g., `CREATE_SPACE`, `UPLOAD_DOCUMENT`, `DELETE_EVENT_AGENDA`).
- **Details**: Full JSON diff/payload of the change is available by clicking the "Info" icon.

### Backup & Restore
Admins can export the entire portal configuration (spaces and sections) as a structured JSON file and restore it to sync environments or recover from accidental deletions.

---

## Security Notes

- **Credential Isolation**: Keycloak client secrets and Google Service Account keys never leave the BFF environment.
- **No Direct Drive Links**: All documents are served via the `/api/documents` proxy. No pre-signed URLs or direct Drive viewer links are exposed, ensuring users cannot bypass portal-level access controls.
- **RBAC Enforcement**: Permissions (Read, Upload, Admin) are validated at the BFF layer using the signed `groups` claim. Client-side state is only used for UI visibility.
- **Google Doc Proxying**: Google Docs linked to events are exported as PDF by the BFF. This ensures that users who cannot access Google's domain (e.g., due to corporate firewalls) can still view meeting content through the portal's secure viewer.
