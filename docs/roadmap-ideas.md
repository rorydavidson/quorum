# Quorum — UX & Functionality Ideas

> A backlog of product/UX ideas surfaced during a repo review. These are
> **suggestions for future work**, not committed scope. Grouped roughly by the
> board/governance use case and the iPad-first goal. Nothing here is required
> to ship; it's a menu to prioritise from.

## Implemented so far

- ✅ **Route error/empty-state polish** — error/loading boundaries + not-found.
- ✅ **Audit-log filtering + CSV export** — filter by action/entity/user/date, paginated, exportable.
- ✅ **Read receipts** — per-document mark-as-read + admin "who has read this".
- ✅ **Notify me (email)** — opt-in per-space email notifications on new
  documents, Official Records, and linked meeting documents (SMTP-backed;
  logs in mock mode when SMTP is unconfigured).

---

## Search & navigation

- **Command palette (⌘K).** `Command` from shadcn/ui is already in the intended
  stack but not wired up. A persistent palette to jump to a space, a recent
  document, or run a search would be a large desktop UX win and matches the
  design system already chosen.
- **Unified full-text search (phase 2).** Search is currently Drive-only. The
  CLAUDE.md roadmap already anticipates AWS OpenSearch for phase 2 — indexing
  documents, meetings, and archives together delivers the "no unified search"
  pain point head-on.

## Board-pack workflow

- **"Notify me" / digest emails.** Alert members when a new agenda or Official
  Record lands in a space they belong to. The audit log + space→group mapping
  already provide everything needed to build this. Governance bodies live on
  "the pack is ready" moments.
- **Mark-as-read / read receipts on board packs.** Even a lightweight per-user
  "mark as read" per document tells secretariats who is prepared for a meeting.
  Extends the `event_metadata` table pattern naturally.
- **Lightweight annotations.** Per-member private notes or highlights on a
  document, kept in the portal (privacy-first, no Drive write-back needed).

## Offline & iPad experience

- **Offline / cached PDF viewing.** Board members read on planes and trains. A
  service worker caching recently-opened PDFs (already proxied through the BFF,
  so no Drive credentials are exposed) would directly target the "Confluence is
  broken on iPadOS" pain point and be a standout feature.
- **Add-to-home-screen PWA polish.** Manifest, icons, and splash so the portal
  behaves like a native app on the board's primary device.

## Calendar

- **Per-space `.ics` subscribe link.** iCal is already fetched server-side;
  exposing a per-user subscribe URL lets members add board meetings to their
  native calendar app instead of only viewing them in-portal.
- **Meeting-at-a-glance.** Surface the next meeting's agenda + linked doc on the
  space landing page so members land on "what's next" rather than a file list.

## Compliance & admin

- **Richer audit-log UI.** Today it is admin-only and list-only. Add filtering
  by space / user / action, a date range, and CSV export. Governance contexts
  frequently need "who accessed what, when" for compliance and FOI-style
  requests.
- **Retention / archival policy tooling.** Official Records exist; a policy view
  showing what's been formally recorded vs. still draft, per space, would help
  secretariats manage the governance lifecycle.

---

## Rough prioritisation

| Idea | User value | Effort | Notes |
|---|---|---|---|
| Error/empty-state polish (see quick wins) | High | Low | Prerequisite for a trustworthy feel |
| Command palette (⌘K) | High | Medium | Stack already supports it |
| Offline PDF caching | High | Medium | Directly answers the core iPad pain point |
| Notify / digest emails | High | Medium | Data model already supports it |
| Per-space `.ics` subscribe | Medium | Low | iCal plumbing already exists |
| Read receipts / mark-as-read | Medium | Medium | Extends `event_metadata` |
| Audit-log filtering + export | Medium | Low–Med | Compliance value |
| Unified search (OpenSearch) | High | High | Phase-2 per existing roadmap |
| Annotations | Medium | High | Privacy-first, portal-held |
