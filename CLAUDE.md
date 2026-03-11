# Quorum — A Governance Portal — CLAUDE.md

> This file is the authoritative project blueprint. Read it at the start of every session.

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
- Environment variables go in .env.local, never hardcoded

## Patterns
- Use server components by default, client components only when interactivity is required
- Error boundaries on every route segment
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

## Testing Strategy

- **Unit tests:** `vitest` for BFF services (Drive, Calendar, Keycloak token parsing)
- **Component tests:** `@testing-library/react` for key UI components (PDFViewer, DocumentList)
- **Integration tests:** BFF route tests with `supertest` + mocked Google APIs
- **E2E:** `Playwright` — auth flow, document listing, PDF viewer open/close
- **iPad testing:** Playwright device emulation (`iPad Pro`) for touch/layout verification

---

## Key Conventions for Claude Sessions

- Always run `pnpm typecheck` and `pnpm lint` before considering a task complete.
- Prefer server components in Next.js App Router; use `'use client'` only when needed (event handlers, state, browser APIs).
- BFF routes follow REST conventions: `GET /documents/:spaceId`, `GET /documents/:spaceId/:fileId/download`.
- Error responses from BFF: `{ error: string, code: string }` with appropriate HTTP status.
- All dates in ISO 8601. Display formatting happens in the frontend only.
- Commit messages: conventional commits format (`feat:`, `fix:`, `chore:`, `docs:`).
