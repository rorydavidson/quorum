import { Router, type IRouter, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  getSpaces,
  getSpaceById,
  upsertSpace,
  deleteSpace,
  upsertSection,
  deleteSection,
  getSectionById,
} from '../services/db.js';
import type { SpaceConfig } from '@snomed/types';

const router: IRouter = Router();

// All admin routes require auth + admin group
router.use(requireAuth);
router.use(requireAdmin);

// ---------------------------------------------------------------------------
// Spaces — GET /admin/spaces
// ---------------------------------------------------------------------------

router.get('/spaces', async (_req: Request, res: Response): Promise<void> => {
  const spaces = await getSpaces();
  res.json(spaces);
});

// ---------------------------------------------------------------------------
// Spaces — GET /admin/spaces/:id
// ---------------------------------------------------------------------------

router.get('/spaces/:id', async (req: Request, res: Response): Promise<void> => {
  const space = await getSpaceById(String(req.params.id));
  if (!space) {
    res.status(404).json({ error: 'Space not found', code: 'SPACE_NOT_FOUND' });
    return;
  }
  res.json(space);
});

// ---------------------------------------------------------------------------
// Spaces — POST /admin/spaces  (create)
// ---------------------------------------------------------------------------

router.post('/spaces', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Partial<SpaceConfig & { id: string }>;

  if (!body.id || !body.name || !body.keycloakGroup || !body.driveFolderId || !body.hierarchyCategory) {
    res.status(400).json({
      error: 'Missing required fields: id, name, keycloakGroup, driveFolderId, hierarchyCategory',
      code: 'INVALID_PAYLOAD',
    });
    return;
  }

  const existing = await getSpaceById(body.id);
  if (existing) {
    res.status(409).json({ error: 'Space with this ID already exists', code: 'CONFLICT' });
    return;
  }

  const space = await upsertSpace(body.id, {
    name: body.name,
    description: body.description,
    keycloakGroup: body.keycloakGroup,
    driveFolderId: body.driveFolderId,
    calendarId: body.calendarId,
    icalUrl: body.icalUrl,
    hierarchyCategory: body.hierarchyCategory,
    uploadGroups: body.uploadGroups ?? [],
    sortOrder: body.sortOrder ?? 0,
  });

  res.status(201).json(space);
});

// ---------------------------------------------------------------------------
// Spaces — PUT /admin/spaces/:id  (update)
// ---------------------------------------------------------------------------

router.put('/spaces/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const body = req.body as Partial<Omit<SpaceConfig, 'id' | 'sections'>>;

  if (!body.name || !body.keycloakGroup || !body.driveFolderId || !body.hierarchyCategory) {
    res.status(400).json({
      error: 'Missing required fields: name, keycloakGroup, driveFolderId, hierarchyCategory',
      code: 'INVALID_PAYLOAD',
    });
    return;
  }

  const space = await upsertSpace(id, {
    name: body.name,
    description: body.description,
    keycloakGroup: body.keycloakGroup,
    driveFolderId: body.driveFolderId,
    calendarId: body.calendarId,
    icalUrl: body.icalUrl,
    hierarchyCategory: body.hierarchyCategory,
    uploadGroups: body.uploadGroups ?? [],
    sortOrder: body.sortOrder ?? 0,
  });

  res.json(space);
});

// ---------------------------------------------------------------------------
// Spaces — DELETE /admin/spaces/:id
// ---------------------------------------------------------------------------

router.delete('/spaces/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const existing = await getSpaceById(id);
  if (!existing) {
    res.status(404).json({ error: 'Space not found', code: 'SPACE_NOT_FOUND' });
    return;
  }
  await deleteSpace(id);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Sections — GET /admin/spaces/:spaceId/sections/:sectionId
// ---------------------------------------------------------------------------

router.get('/spaces/:spaceId/sections/:sectionId', async (req: Request, res: Response): Promise<void> => {
  const section = await getSectionById(
    String(req.params.spaceId),
    String(req.params.sectionId)
  );
  if (!section) {
    res.status(404).json({ error: 'Section not found', code: 'SECTION_NOT_FOUND' });
    return;
  }
  res.json(section);
});

// ---------------------------------------------------------------------------
// Sections — POST /admin/spaces/:spaceId/sections  (create)
// ---------------------------------------------------------------------------

router.post('/spaces/:spaceId/sections', async (req: Request, res: Response): Promise<void> => {
  const spaceId = String(req.params.spaceId);
  const space = await getSpaceById(spaceId);
  if (!space) {
    res.status(404).json({ error: 'Space not found', code: 'SPACE_NOT_FOUND' });
    return;
  }

  const body = req.body as { id?: string; name?: string; description?: string; driveFolderId?: string; sortOrder?: number };
  if (!body.id || !body.name || !body.driveFolderId) {
    res.status(400).json({
      error: 'Missing required fields: id, name, driveFolderId',
      code: 'INVALID_PAYLOAD',
    });
    return;
  }

  const existing = await getSectionById(spaceId, body.id);
  if (existing) {
    res.status(409).json({ error: 'Section with this ID already exists in this space', code: 'CONFLICT' });
    return;
  }

  const section = await upsertSection(spaceId, body.id, {
    name: body.name,
    description: body.description,
    driveFolderId: body.driveFolderId,
    sortOrder: body.sortOrder ?? 0,
  });

  res.status(201).json(section);
});

// ---------------------------------------------------------------------------
// Sections — PUT /admin/spaces/:spaceId/sections/:sectionId  (update)
// ---------------------------------------------------------------------------

router.put('/spaces/:spaceId/sections/:sectionId', async (req: Request, res: Response): Promise<void> => {
  const spaceId = String(req.params.spaceId);
  const sectionId = String(req.params.sectionId);

  const space = await getSpaceById(spaceId);
  if (!space) {
    res.status(404).json({ error: 'Space not found', code: 'SPACE_NOT_FOUND' });
    return;
  }

  const body = req.body as { name?: string; description?: string; driveFolderId?: string; sortOrder?: number };
  if (!body.name || !body.driveFolderId) {
    res.status(400).json({
      error: 'Missing required fields: name, driveFolderId',
      code: 'INVALID_PAYLOAD',
    });
    return;
  }

  const section = await upsertSection(spaceId, sectionId, {
    name: body.name,
    description: body.description,
    driveFolderId: body.driveFolderId,
    sortOrder: body.sortOrder ?? 0,
  });

  res.json(section);
});

// ---------------------------------------------------------------------------
// Sections — DELETE /admin/spaces/:spaceId/sections/:sectionId
// ---------------------------------------------------------------------------

router.delete('/spaces/:spaceId/sections/:sectionId', async (req: Request, res: Response): Promise<void> => {
  const spaceId = String(req.params.spaceId);
  const sectionId = String(req.params.sectionId);

  const section = await getSectionById(spaceId, sectionId);
  if (!section) {
    res.status(404).json({ error: 'Section not found', code: 'SECTION_NOT_FOUND' });
    return;
  }

  await deleteSection(spaceId, sectionId);
  res.status(204).end();
});

export default router;
