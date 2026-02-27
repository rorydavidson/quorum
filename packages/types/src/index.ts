// User session — populated from Keycloak ID token
export interface SessionUser {
  sub: string;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  groups: string[];
}

// A named document section within a space, backed by its own Drive folder
export interface SpaceSection {
  id: string;            // e.g. "agendas", "minutes"
  name: string;          // e.g. "Agendas", "Minutes & Resolutions"
  description?: string;
  driveFolderId: string;
  sortOrder: number;
}

// Space configuration — stored in DB, managed via Admin dashboard
export interface SpaceConfig {
  id: string;
  name: string;
  description?: string;
  keycloakGroup: string;            // e.g. "/board-members"
  driveFolderId: string;            // Google Drive folder ID (default / legacy section)
  calendarId?: string;              // Google Calendar ID — used with SA credentials or public calendars
  icalUrl?: string;                 // Direct iCal/ICS feed URL — works without any Google auth
  discourseCategorySlug?: string;   // Discourse forum category slug — topics appear on space overview
  hierarchyCategory: string;        // e.g. "Board Level", "Working Groups"
  uploadGroups: string[];           // Keycloak groups allowed to upload
  sortOrder: number;
  sections: SpaceSection[];         // Named document sub-sections (may be empty)
}

// Document listing entry — from Google Drive
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  createdTime: string;         // ISO 8601
  modifiedTime: string;        // ISO 8601
  webViewLink?: string;
  isOfficialRecord: boolean;
}

// Calendar event — from Google Calendar
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;               // ISO 8601
  end: string;                 // ISO 8601
  location?: string;
  htmlLink?: string;
  spaceId: string;
  spaceName: string;
}

// Unified search results
export type SearchResult =
  | { type: 'file'; data: DriveFile; spaceId: string; spaceName: string }
  | { type: 'event'; data: CalendarEvent }
  | { type: 'archive'; data: DriveFile; spaceId: string; spaceName: string };

// BFF error response shape
export interface ApiError {
  error: string;
  code: string;
}

// Discourse forum topic — from forums.snomed.org public API
export interface DiscoursePost {
  id: number;
  title: string;
  slug: string;
  postsCount: number;
  replyCount: number;
  views: number;
  createdAt: string;      // ISO 8601
  lastPostedAt: string;   // ISO 8601
  url: string;            // https://forums.snomed.org/t/{slug}/{id}
}

// Admin: create/update space config payload
export interface UpsertSpacePayload {
  name: string;
  description?: string;
  keycloakGroup: string;
  driveFolderId: string;
  calendarId?: string;
  icalUrl?: string;
  discourseCategorySlug?: string;
  hierarchyCategory: string;
  uploadGroups: string[];
  sortOrder: number;
}

export interface AgendaItem {
  id: string;
  text: string;
  responsible?: string;
  completed: boolean;
}

export interface EventMetadata {
  id: string;
  spaceId: string;
  googleDocUrl?: string;
  agendaItems: AgendaItem[];
}

export interface AuditLog {
  id: number;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string; // JSON string
}
