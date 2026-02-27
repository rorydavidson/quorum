import { Router, type IRouter, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getSpaces, getSpaceById } from '../services/db.js';
import { getDiscourseTopics } from '../services/discourse.js';
import type { DiscoursePost } from '@snomed/types';

const router: IRouter = Router();

// All forum routes require an active session
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helpers (same pattern as calendar.ts)
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
// GET /forum
// Returns recent Discourse topics across all accessible spaces that have a
// discourseCategorySlug configured.
//
// Query params:
//   spaceId (optional) — restrict to a single space
//   limit   (default 5, max 20) — topics per space
// ---------------------------------------------------------------------------

router.get('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  const admin = isAdminUser(user.groups);

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '5'), 10) || 5, 1), 20);
  const filterSpaceId = req.query.spaceId ? String(req.query.spaceId) : undefined;

  // If a specific space is requested, use the single-space route logic
  if (filterSpaceId) {
    const space = await getSpaceById(filterSpaceId);
    if (!space) {
      res.status(404).json({ error: 'Space not found', code: 'SPACE_NOT_FOUND' });
      return;
    }

    if (!admin && !userCanAccessSpace(user.groups, space.keycloakGroup)) {
      res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    if (!space.discourseCategorySlug) {
      res.json([]);
      return;
    }

    const topics = await getDiscourseTopics(space.discourseCategorySlug, limit);
    res.json(topics);
    return;
  }

  // No spaceId — aggregate across all accessible spaces
  const allSpaces = await getSpaces();

  const accessibleSpaces = admin
    ? allSpaces
    : allSpaces.filter((s) => userCanAccessSpace(user.groups, s.keycloakGroup));

  const spacesWithForum = accessibleSpaces.filter((s) => !!s.discourseCategorySlug);

  if (spacesWithForum.length === 0) {
    res.json([]);
    return;
  }

  // Fetch topics from all spaces in parallel; ignore individual failures
  const results = await Promise.allSettled(
    spacesWithForum.map((s) => getDiscourseTopics(s.discourseCategorySlug!, limit))
  );

  const topics: DiscoursePost[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      topics.push(...result.value);
    }
  }

  // Sort by most recently active, then cap at limit
  topics.sort((a, b) => new Date(b.lastPostedAt).getTime() - new Date(a.lastPostedAt).getTime());
  res.json(topics.slice(0, limit));
}));

export default router;
