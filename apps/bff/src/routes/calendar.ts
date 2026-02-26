import { Router, type IRouter, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getSpaces } from '../services/db.js';
import { getUpcomingEvents } from '../services/calendar.js';

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

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  const admin = isAdminUser(user.groups);

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '10'), 10) || 10, 1), 50);
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? '30'), 10) || 30, 1), 365);
  const filterSpaceId = req.query.spaceId ? String(req.query.spaceId) : undefined;

  try {
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

    const events = await getUpcomingEvents(calendarEntries, limit, days);
    res.json(events);
  } catch (err) {
    console.error('[calendar] Error fetching events:', err);
    res.status(502).json({ error: 'Failed to fetch calendar events', code: 'CALENDAR_ERROR' });
  }
});

export default router;
