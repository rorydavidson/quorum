import type { SpaceConfig, SpaceSection, DriveFile, CalendarEvent } from '@snomed/types';

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
export function fileDownloadUrl(spaceId: string, fileId: string): string {
  return `/api/documents/${spaceId}/${fileId}/download`;
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
