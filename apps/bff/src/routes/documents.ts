import { Router, type IRouter, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getSpaces, getSpaceById, getSectionById } from '../services/db.js';
import { listFiles, downloadFile } from '../services/drive.js';

const router: IRouter = Router();

// All document routes require an active session
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helper: check whether the session user belongs to a space's keycloak group
// ---------------------------------------------------------------------------

function userCanAccessSpace(
  userGroups: string[],
  spaceGroup: string,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  // Keycloak groups can be bare ("board-members") or path-prefixed ("/board-members")
  return userGroups.some(
    (g) => g === spaceGroup || g === spaceGroup.replace(/^\//, '') || `/${g}` === spaceGroup
  );
}

function isAdminUser(groups: string[]): boolean {
  return groups.some((g) => g === 'portal_admin' || g === '/portal_admin');
}

// ---------------------------------------------------------------------------
// GET /documents — list all spaces the user can access
// ---------------------------------------------------------------------------

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  const admin = isAdminUser(user.groups);
  const allSpaces = await getSpaces();
  const accessible = admin
    ? allSpaces
    : allSpaces.filter((s) => userCanAccessSpace(user.groups, s.keycloakGroup, false));
  res.json(accessible);
});

// ---------------------------------------------------------------------------
// GET /documents/:spaceId — list files in a space's default Drive folder
// ---------------------------------------------------------------------------

router.get('/:spaceId', async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  const space = await getSpaceById(String(req.params.spaceId));

  if (!space) {
    res.status(404).json({ error: 'Space not found', code: 'SPACE_NOT_FOUND' });
    return;
  }

  if (!userCanAccessSpace(user.groups, space.keycloakGroup, isAdminUser(user.groups))) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  try {
    const files = await listFiles(space.driveFolderId);
    res.json({ space, files });
  } catch (err) {
    console.error('[documents] Drive error:', err);
    res.status(502).json({ error: 'Failed to list files from Drive', code: 'DRIVE_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// GET /documents/:spaceId/sections/:sectionId — list files in a named section
// ---------------------------------------------------------------------------

router.get('/:spaceId/sections/:sectionId', async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  const spaceId = String(req.params.spaceId);
  const sectionId = String(req.params.sectionId);

  const space = await getSpaceById(spaceId);
  if (!space) {
    res.status(404).json({ error: 'Space not found', code: 'SPACE_NOT_FOUND' });
    return;
  }

  if (!userCanAccessSpace(user.groups, space.keycloakGroup, isAdminUser(user.groups))) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  const section = await getSectionById(spaceId, sectionId);
  if (!section) {
    res.status(404).json({ error: 'Section not found', code: 'SECTION_NOT_FOUND' });
    return;
  }

  try {
    const files = await listFiles(section.driveFolderId);
    res.json({ space, section, files });
  } catch (err) {
    console.error('[documents] Drive error:', err);
    res.status(502).json({ error: 'Failed to list files from Drive', code: 'DRIVE_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// GET /documents/:spaceId/:fileId/download — proxy file from Drive
// ---------------------------------------------------------------------------

router.get('/:spaceId/:fileId/download', async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  const space = await getSpaceById(String(req.params.spaceId));

  if (!space) {
    res.status(404).json({ error: 'Space not found', code: 'SPACE_NOT_FOUND' });
    return;
  }

  if (!userCanAccessSpace(user.groups, space.keycloakGroup, isAdminUser(user.groups))) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  try {
    const { stream, mimeType, name } = await downloadFile(String(req.params.fileId));
    // inline so PDFs open in the browser / PDF viewer rather than triggering a download
    const disposition = mimeType === 'application/pdf' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(name)}"`);
    stream.pipe(res);
  } catch (err) {
    console.error('[documents] Download error:', err);
    res.status(502).json({ error: 'Failed to download file from Drive', code: 'DRIVE_ERROR' });
  }
});

export default router;
