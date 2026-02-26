// User session — populated from Keycloak ID token
export interface SessionUser {
  sub: string;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  groups: string[];
}

// Space configuration — stored in DB, managed via Admin dashboard
export interface SpaceConfig {
  id: string;
  name: string;
  description?: string;
  keycloakGroup: string;       // e.g. "/board-members"
  driveFolderId: string;       // Google Drive folder ID
  calendarId?: string;         // Google Calendar ID (optional)
  hierarchyCategory: string;   // e.g. "Board Level", "Working Groups"
  uploadGroups: string[];      // Keycloak groups allowed to upload
  sortOrder: number;
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

// Admin: create/update space config payload
export interface UpsertSpacePayload {
  name: string;
  description?: string;
  keycloakGroup: string;
  driveFolderId: string;
  calendarId?: string;
  hierarchyCategory: string;
  uploadGroups: string[];
  sortOrder: number;
}
