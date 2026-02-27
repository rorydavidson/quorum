import { Router, type IRouter, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getSpaces, getSpaceById, getEventMetadata } from '../services/db.js';
import { getUpcomingEvents, getEventByID } from '../services/calendar.js';

const router: IRouter = Router();

// All calendar routes require an active session
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helpers (duplicated from documents.ts — shared logic kept local to avoid coupling)
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
// GET /calendar — upcoming events across the user's accessible spaces
// ---------------------------------------------------------------------------
//
// Query params:
//   limit   (default 10, max 50)  — max number of events to return
//   days    (default 30, max 365) — look-ahead window in days
//   spaceId (optional)            — restrict results to a single space

router.get('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  const admin = isAdminUser(user.groups);

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '10'), 10) || 10, 1), 50);
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? '30'), 10) || 30, 1), 365);
  const filterSpaceId = req.query.spaceId ? String(req.query.spaceId) : undefined;

  const allSpaces = await getSpaces();

  const accessibleSpaces = admin
    ? allSpaces
    : allSpaces.filter((s) => userCanAccessSpace(user.groups, s.keycloakGroup));

  const calendarEntries = accessibleSpaces
    .filter((s) => s.calendarId || s.icalUrl)  // include spaces with either identifier
    .filter((s) => !filterSpaceId || s.id === filterSpaceId)
    .map((s) => ({
      calendarId: s.calendarId ?? '',
      icalUrl: s.icalUrl,
      spaceId: s.id,
      spaceName: s.name,
    }));

  let events: Awaited<ReturnType<typeof getUpcomingEvents>>;
  try {
    events = await getUpcomingEvents(calendarEntries, limit, days);
  } catch (err) {
    console.error('[calendar] getUpcomingEvents failed:', err);
    res.status(502).json({ error: 'Failed to fetch calendar events', code: 'CALENDAR_ERROR' });
    return;
  }
  res.json(events);
}));

/**
 * GET /calendar/:spaceId/:eventId — fetch a single event with its metadata (Doc URL, agenda)
 */
router.get('/:spaceId/:eventId', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const spaceId = req.params.spaceId as string;
  const eventId = req.params.eventId as string;
  const user = req.session.user!;
  const admin = isAdminUser(user.groups);

  const space = await getSpaceById(spaceId);
  if (!space) {
    res.status(404).json({ error: 'Space not found', code: 'SPACE_NOT_FOUND' });
    return;
  }

  // Auth check
  if (!admin && !userCanAccessSpace(user.groups, space.keycloakGroup)) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  const rawEvent = await getEventByID(space.calendarId ?? '', space.icalUrl, eventId);
  if (!rawEvent) {
    res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    return;
  }

  // Fetch metadata stored in our DB
  const metadata = await getEventMetadata(eventId);

  res.json({
    event: {
      ...rawEvent,
      spaceId: space.id,
      spaceName: space.name,
    },
    metadata: metadata ?? { id: eventId, spaceId, googleDocUrl: undefined, agendaItems: [] },
  });
}));

export default router;
