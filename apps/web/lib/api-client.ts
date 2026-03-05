import type { SpaceConfig, SpaceSection, DriveFile, CalendarEvent, SearchResult, SessionUser, EventMetadata, DiscoursePost, HierarchyCategoryConfig } from '@snomed/types';

// ---------------------------------------------------------------------------
// Typed fetch wrapper — all calls go to Next.js API routes which proxy to BFF.
// Cookies are forwarded automatically when called from server components.
// ---------------------------------------------------------------------------

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

interface FetchOptions {
  /** Cookie header to forward — pass from incoming request headers in server components. */
  cookie?: string;
  cache?: RequestCache;
  next?: NextFetchRequestConfig;
}

async function bffFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.cookie) headers['cookie'] = options.cookie;

  const res = await fetch(`${BFF_URL}${path}`, {
    headers,
    cache: options.cache,
    next: options.next,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body.error ?? `BFF error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Documents / Spaces
// ---------------------------------------------------------------------------

export interface SpaceWithFiles {
  space: SpaceConfig;
  files: DriveFile[];
}

export interface SectionWithFiles {
  space: SpaceConfig;
  section: SpaceSection;
  files: DriveFile[];
}

/**
 * Fetch all spaces accessible to the current user.
 * Call from server components — pass the incoming cookie header.
 */
export async function getAccessibleSpaces(cookie: string): Promise<SpaceConfig[]> {
  return bffFetch<SpaceConfig[]>('/documents', { cookie, next: { revalidate: 30 } });
}

/**
 * Fetch category sort-order configs.
 * Returns an empty array gracefully if no configs have been saved yet.
 * Call from server components — pass the incoming cookie header.
 */
export async function getCategoryConfigs(cookie: string): Promise<HierarchyCategoryConfig[]> {
  try {
    return await bffFetch<HierarchyCategoryConfig[]>('/documents/categories', {
      cookie,
      next: { revalidate: 60 },
    });
  } catch {
    return [];
  }
}

/**
 * Fetch files for a specific space.
 */
export async function getSpaceFiles(spaceId: string, cookie: string, folderId?: string): Promise<SpaceWithFiles> {
  let url = `/documents/${spaceId}`;
  if (folderId) url += `?folderId=${encodeURIComponent(folderId)}`;
  return bffFetch<SpaceWithFiles>(url, {
    cookie,
    cache: 'no-store', // always fresh — sections change via admin
  });
}

/**
 * Fetch files for a named section within a space.
 */
export async function getSectionFiles(
  spaceId: string,
  sectionId: string,
  cookie: string,
  folderId?: string
): Promise<SectionWithFiles> {
  let url = `/documents/${spaceId}/sections/${sectionId}`;
  if (folderId) url += `?folderId=${encodeURIComponent(folderId)}`;
  return bffFetch<SectionWithFiles>(url, {
    cookie,
    cache: 'no-store',
  });
}

/**
 * Build the URL for proxying a file download through the BFF.
 * Used as the `href` on download links and as the `url` passed to PDFViewer.
 * The Next.js API route at /api/documents/[...path] proxies to BFF.
 */
/** URL for streaming a file inline (used by the PDF viewer). */
export function fileDownloadUrl(spaceId: string, fileId: string): string {
  return `/api/documents/${spaceId}/${fileId}/download`;
}

/**
 * URL that forces Content-Disposition: attachment so the browser opens a
 * save-as dialog. Use this for explicit download buttons.
 * Google Docs/Sheets/Slides are exported as PDF by the BFF before download.
 */
export function fileForceDownloadUrl(spaceId: string, fileId: string): string {
  return `/api/documents/${spaceId}/${fileId}/download?download=1`;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/**
 * Fetch upcoming calendar events across all spaces the user can access.
 * Call from server components — pass the incoming cookie header.
 */
export async function getUpcomingEvents(
  cookie: string,
  limit = 10,
  days = 30
): Promise<CalendarEvent[]> {
  return bffFetch<CalendarEvent[]>(`/calendar?limit=${limit}&days=${days}`, {
    cookie,
    cache: 'no-store',
  });
}

/**
 * Fetch upcoming events scoped to a single space.
 * Used on the space landing page and the space calendar view.
 */
export async function getSpaceEvents(
  spaceId: string,
  cookie: string,
  limit = 5,
  days = 90
): Promise<CalendarEvent[]> {
  return bffFetch<CalendarEvent[]>(
    `/calendar?spaceId=${encodeURIComponent(spaceId)}&limit=${limit}&days=${days}`,
    { cookie, cache: 'no-store' }
  );
}

/**
 * Fetch a single event with its database metadata.
 */
export async function getEventDetails(
  spaceId: string,
  eventId: string,
  cookie: string
): Promise<{ event: CalendarEvent; metadata: EventMetadata }> {
  return bffFetch<{ event: CalendarEvent; metadata: EventMetadata }>(
    `/calendar/${spaceId}/${eventId}`,
    { cookie, cache: 'no-store' }
  );
}

// ---------------------------------------------------------------------------
// Forum (Discourse)
// ---------------------------------------------------------------------------

/**
 * Fetch recent Discourse topics for a single space.
 * Returns an empty array if the space has no discourseCategorySlug configured.
 */
export async function getSpaceForumTopics(
  spaceId: string,
  cookie: string,
  limit = 5,
): Promise<DiscoursePost[]> {
  return bffFetch<DiscoursePost[]>(
    `/forum?spaceId=${encodeURIComponent(spaceId)}&limit=${limit}`,
    { cookie, cache: 'no-store' }
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Unified search across Drive files and calendar events.
 * Call from server components — pass the incoming cookie header.
 */
export async function searchAll(
  q: string,
  cookie: string,
  limit = 20
): Promise<SearchResult[]> {
  if (q.trim().length < 2) return [];
  return bffFetch<SearchResult[]>(
    `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    { cookie, cache: 'no-store' }
  );
}

// ---------------------------------------------------------------------------
// Auth helpers — server-side only
// ---------------------------------------------------------------------------

/**
 * Parse the session user from the x-quorum-user request header injected by
 * Next.js middleware. Avoids an extra BFF /auth/session round-trip in server
 * components that only need user metadata (e.g. for RBAC checks).
 *
 * Pass the ReadonlyHeaders from `import { headers } from 'next/headers'`.
 */
export function getUserFromHeaders(
  headerStore: { get(name: string): string | null }
): SessionUser | null {
  const raw = headerStore.get('x-quorum-user');
  if (!raw) return null;
  try {
    // Middleware encodes the user JSON as Base64 to safely handle Unicode
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    return JSON.parse(decoded) as SessionUser;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Space meta (client-side) — returns config without Drive files
// ---------------------------------------------------------------------------

/**
 * Fetch space config without listing Drive files.
 * Client-side only (relative URL). Used by the sidebar to show space nav.
 */
export async function getSpaceMeta(spaceId: string): Promise<SpaceConfig> {
  const res = await fetch(`/api/documents/${spaceId}/meta`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? `Error ${res.status}`);
  }
  const data = await res.json() as { space: SpaceConfig };
  return data.space;
}

// ---------------------------------------------------------------------------
// Upload — client-side (uses XHR for progress reporting)
// ---------------------------------------------------------------------------

export interface UploadProgress {
  percent: number; // 0-100
}

/**
 * Upload a file to a space's Drive folder.
 * Returns the newly-created DriveFile on success.
 * `onProgress` is called periodically with the upload percentage.
 */
export function uploadFileToSpace(
  spaceId: string,
  file: File,
  sectionId?: string,
  folderId?: string,
  onProgress?: (p: UploadProgress) => void
): Promise<DriveFile> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    const url = new URL(`/api/documents/${spaceId}/upload`, window.location.origin);
    if (folderId) url.searchParams.set('folderId', folderId);
    else if (sectionId) url.searchParams.set('sectionId', sectionId);

    xhr.open('POST', url.toString());

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress({ percent: Math.round((e.loaded / e.total) * 100) });
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText) as DriveFile);
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        let message = `Upload failed (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          if (body.error) message = body.error;
        } catch { /* ignore */ }
        reject(new Error(message));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.send(form);
  });
}

/**
 * Create an Official Record copy of a single document.
 * Returns the newly created DriveFile (with isOfficialRecord: true).
 * Called from the DocumentList when the user clicks "Make Official Record".
 */
export async function createOfficialRecord(
  spaceId: string,
  fileId: string,
  fileName: string,
): Promise<DriveFile> {
  const res = await fetch(
    `/api/admin/spaces/${spaceId}/files/${fileId}/snapshot`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create Official Record' })) as { error?: string };
    throw new Error(err.error ?? 'Failed to create Official Record');
  }

  return res.json() as Promise<DriveFile>;
}

/**
 * Delete a file from a space.
 */
export async function deleteFileFromSpace(spaceId: string, fileId: string): Promise<void> {
  const res = await fetch(`/api/documents/${spaceId}/${fileId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Delete failed' }));
    throw new Error(err.error || 'Delete failed');
  }
}

/**
 * Create a new folder in a space's Drive folder.
 * Client-side only (relative URL). Returns the created DriveFile.
 */
export async function createFolderInSpace(
  spaceId: string,
  name: string,
  sectionId?: string,
  folderId?: string | null,
): Promise<DriveFile> {
  const url = new URL(`/api/documents/${spaceId}/folders`, window.location.origin);
  if (folderId) url.searchParams.set('folderId', folderId);
  else if (sectionId) url.searchParams.set('sectionId', sectionId);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create folder' })) as { error?: string };
    throw new Error(err.error ?? 'Failed to create folder');
  }

  return res.json() as Promise<DriveFile>;
}

/**
 * Fetch metadata for a specific event (Google Doc URL, agenda items).
 */
export async function getEventMetadata(
  spaceId: string,
  eventId: string,
  cookie: string
): Promise<EventMetadata> {
  return bffFetch<EventMetadata>(`/events/${spaceId}/${eventId}`, {
    cookie,
    cache: 'no-store',
  });
}

/**
 * Update metadata for an event.
 */
export async function updateEventMetadata(
  spaceId: string,
  eventId: string,
  payload: Partial<Omit<EventMetadata, 'id' | 'spaceId'>>
): Promise<EventMetadata> {
  const res = await fetch(`/api/events/${spaceId}/${eventId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update event metadata');
  }

  return res.json();
}
