import type { SpaceConfig, SpaceSection, DriveFile, CalendarEvent, SearchResult, SessionUser } from '@snomed/types';

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
 * Fetch files for a specific space.
 */
export async function getSpaceFiles(spaceId: string, cookie: string): Promise<SpaceWithFiles> {
  return bffFetch<SpaceWithFiles>(`/documents/${spaceId}`, {
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
  cookie: string
): Promise<SectionWithFiles> {
  return bffFetch<SectionWithFiles>(`/documents/${spaceId}/sections/${sectionId}`, {
    cookie,
    next: { revalidate: 60 },
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
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
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
  onProgress?: (p: UploadProgress) => void
): Promise<DriveFile> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/documents/${spaceId}/upload`);

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
