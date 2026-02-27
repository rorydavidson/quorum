import { Router, type IRouter, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getSpaces } from '../services/db.js';
import { searchFilesInFolders } from '../services/drive.js';
import { getUpcomingEvents } from '../services/calendar.js';
import type { SearchResult } from '@snomed/types';

const router: IRouter = Router();

router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helpers (consistent with other routes)
// ---------------------------------------------------------------------------

function isAdminUser(groups: string[]): boolean {
  return groups.some((g) => g === 'portal_admin' || g === '/portal_admin');
}

function userCanAccessSpace(userGroups: string[], spaceGroup: string): boolean {
  return userGroups.some(
    (g) => g === spaceGroup || g === spaceGroup.replace(/^\//, '') || `/${g}` === spaceGroup
  );
}

// ---------------------------------------------------------------------------
// GET /search?q=<query>&limit=20
//
// Parallel search across:
//   1. Google Drive files in all accessible space folders (+ section folders)
//   2. Upcoming calendar events filtered by title / description / location
//
// Returns SearchResult[] sorted: files first (by modifiedTime), then events (by start).
// ---------------------------------------------------------------------------

router.get('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  const q = String(req.query.q ?? '').trim();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 50);

  if (q.length < 2) {
    res.json([]);
    return;
  }

  const admin = isAdminUser(user.groups);
  const allSpaces = await getSpaces();
  const accessibleSpaces = admin
    ? allSpaces
    : allSpaces.filter((s) => userCanAccessSpace(user.groups, s.keycloakGroup));

  const fileResults: SearchResult[] = [];
  const eventResults: SearchResult[] = [];
  const seen = new Set<string>();

  // Per-space file count: spread the result limit evenly, minimum 5 per space
  const perSpaceLimit = Math.max(5, Math.ceil(limit / Math.max(accessibleSpaces.length, 1)));

  await Promise.allSettled([
    // ---------------------------------------------------------------
    // Drive: search each space's folder(s) in parallel
    // ---------------------------------------------------------------
    ...accessibleSpaces.map(async (space) => {
      try {
        const folderIds = [
          space.driveFolderId,
          ...space.sections.map((s) => s.driveFolderId),
        ];

        const files = await searchFilesInFolders(folderIds, q, perSpaceLimit);

        for (const file of files) {
          const key = `file-${file.id}`;
          if (seen.has(key)) continue;
          seen.add(key);

          if (file.isOfficialRecord) {
            fileResults.push({ type: 'archive', data: file, spaceId: space.id, spaceName: space.name });
          } else {
            fileResults.push({ type: 'file', data: file, spaceId: space.id, spaceName: space.name });
          }
        }
      } catch (err) {
        console.error(`[search] Drive search failed for space ${space.id}:`, (err as Error).message);
      }
    }),

    // ---------------------------------------------------------------
    // Calendar: fetch upcoming events for the year, filter by query
    // ---------------------------------------------------------------
    (async () => {
      try {
        const calendarEntries = accessibleSpaces
          .filter((s) => s.calendarId || s.icalUrl)
          .map((s) => ({
            calendarId: s.calendarId ?? '',
            icalUrl: s.icalUrl,
            spaceId: s.id,
            spaceName: s.name,
          }));

        if (calendarEntries.length === 0) return;

        // Fetch a broad window — search across the whole year
        const events = await getUpcomingEvents(calendarEntries, 100, 365);
        const ql = q.toLowerCase();

        for (const evt of events) {
          const matches =
            evt.summary.toLowerCase().includes(ql) ||
            (evt.description?.toLowerCase().includes(ql) ?? false) ||
            (evt.location?.toLowerCase().includes(ql) ?? false);

          if (!matches) continue;

          const key = `event-${evt.id}`;
          if (seen.has(key)) continue;
          seen.add(key);

          eventResults.push({ type: 'event', data: evt });
        }
      } catch (err) {
        console.error('[search] Calendar search failed:', (err as Error).message);
      }
    })(),
  ]);

  // Combine: files first (sorted by modifiedTime desc), then events (sorted by start asc)
  const combined: SearchResult[] = [
    ...fileResults.sort((a, b) => {
      const at = a.type !== 'event' ? a.data.modifiedTime : '';
      const bt = b.type !== 'event' ? b.data.modifiedTime : '';
      return bt.localeCompare(at);
    }),
    ...eventResults.sort((a, b) => {
      const at = a.type === 'event' ? a.data.start : '';
      const bt = b.type === 'event' ? b.data.start : '';
      return at.localeCompare(bt);
    }),
  ];

  res.json(combined.slice(0, limit));
}));

export default router;
