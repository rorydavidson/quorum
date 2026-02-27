import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  getSpaces,
  getSpaceById,
  upsertSpace,
  deleteSpace,
  upsertSection,
  deleteSection,
  getSectionById,
  getBackup,
  restoreBackup,
  createAuditLog,
  getAuditLogs,
} from "../services/db.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const SpaceWriteSchema = z.object({
  id: z.string().min(1).max(100).optional(), // only required on create
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  keycloakGroup: z.string().min(1).max(200),
  driveFolderId: z.string().min(1).max(200),
  calendarId: z.string().max(500).optional(),
  icalUrl: z.string().max(2048).optional(),
  hierarchyCategory: z.string().min(1).max(200),
  uploadGroups: z.array(z.string().max(200)).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const SectionWriteSchema = z.object({
  id: z.string().min(1).max(100).optional(), // only required on create
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  driveFolderId: z.string().min(1).max(200),
  sortOrder: z.number().int().min(0).optional(),
});

// Helper: sends Zod validation errors as a structured 400 response
function zodError(res: Response, err: z.ZodError): void {
  res.status(400).json({
    error: "Validation failed",
    code: "INVALID_PAYLOAD",
    details: err.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    })),
  });
}

// All admin routes require auth + admin group
router.use(requireAuth);
router.use(requireAdmin);

// ---------------------------------------------------------------------------
// Spaces — GET /admin/spaces
// ---------------------------------------------------------------------------

router.get("/spaces", async (_req: Request, res: Response): Promise<void> => {
  const spaces = await getSpaces();
  res.json(spaces);
});

// ---------------------------------------------------------------------------
// Spaces — GET /admin/spaces/:id
// ---------------------------------------------------------------------------

router.get(
  "/spaces/:id",
  async (req: Request, res: Response): Promise<void> => {
    const space = await getSpaceById(String(req.params.id));
    if (!space) {
      res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }
    res.json(space);
  },
);

// ---------------------------------------------------------------------------
// Spaces — POST /admin/spaces  (create)
// ---------------------------------------------------------------------------

router.post("/spaces", async (req: Request, res: Response): Promise<void> => {
  const parsed = SpaceWriteSchema.required({ id: true }).safeParse(req.body);
  if (!parsed.success) { zodError(res, parsed.error); return; }
  const body = parsed.data;

  const existing = await getSpaceById(body.id);
  if (existing) {
    res.status(409).json({ error: "Space with this ID already exists", code: "CONFLICT" });
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

  const user = req.session.user!;
  await createAuditLog({
    userId: user.sub,
    userName: user.name,
    action: "CREATE_SPACE",
    entityType: "SPACE",
    entityId: body.id,
    details: JSON.stringify(body),
  });

  res.status(201).json(space);
});

// ---------------------------------------------------------------------------
// Spaces — PUT /admin/spaces/:id  (update)
// ---------------------------------------------------------------------------

router.put(
  "/spaces/:id",
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const parsed = SpaceWriteSchema.safeParse(req.body);
    if (!parsed.success) { zodError(res, parsed.error); return; }
    const body = parsed.data;

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

    const user = req.session.user!;
    await createAuditLog({
      userId: user.sub,
      userName: user.name,
      action: "UPDATE_SPACE",
      entityType: "SPACE",
      entityId: id,
      details: JSON.stringify(body),
    });

    res.json(space);
  },
);

// ---------------------------------------------------------------------------
// Spaces — DELETE /admin/spaces/:id
// ---------------------------------------------------------------------------

router.delete(
  "/spaces/:id",
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const existing = await getSpaceById(id);
    if (!existing) {
      res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }
    await deleteSpace(id);

    const user = req.session.user!;
    await createAuditLog({
      userId: user.sub,
      userName: user.name,
      action: "DELETE_SPACE",
      entityType: "SPACE",
      entityId: id,
      details: JSON.stringify(existing),
    });

    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// Sections — GET /admin/spaces/:spaceId/sections/:sectionId
// ---------------------------------------------------------------------------

router.get(
  "/spaces/:spaceId/sections/:sectionId",
  async (req: Request, res: Response): Promise<void> => {
    const section = await getSectionById(
      String(req.params.spaceId),
      String(req.params.sectionId),
    );
    if (!section) {
      res.status(404).json({ error: "Section not found", code: "SECTION_NOT_FOUND" });
      return;
    }
    res.json(section);
  },
);

// ---------------------------------------------------------------------------
// Sections — POST /admin/spaces/:spaceId/sections  (create)
// ---------------------------------------------------------------------------

router.post(
  "/spaces/:spaceId/sections",
  async (req: Request, res: Response): Promise<void> => {
    const spaceId = String(req.params.spaceId);
    const space = await getSpaceById(spaceId);
    if (!space) {
      res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }

    const parsed = SectionWriteSchema.required({ id: true }).safeParse(req.body);
    if (!parsed.success) { zodError(res, parsed.error); return; }
    const body = parsed.data;

    const existing = await getSectionById(spaceId, body.id);
    if (existing) {
      res.status(409).json({
        error: "Section with this ID already exists in this space",
        code: "CONFLICT",
      });
      return;
    }

    const section = await upsertSection(spaceId, body.id, {
      name: body.name,
      description: body.description,
      driveFolderId: body.driveFolderId,
      sortOrder: body.sortOrder ?? 0,
    });

    const user = req.session.user!;
    await createAuditLog({
      userId: user.sub,
      userName: user.name,
      action: "CREATE_SECTION",
      entityType: "SECTION",
      entityId: body.id,
      details: JSON.stringify({ spaceId, ...body }),
    });

    res.status(201).json(section);
  },
);

// ---------------------------------------------------------------------------
// Sections — PUT /admin/spaces/:spaceId/sections/:sectionId  (update)
// ---------------------------------------------------------------------------

router.put(
  "/spaces/:spaceId/sections/:sectionId",
  async (req: Request, res: Response): Promise<void> => {
    const spaceId = String(req.params.spaceId);
    const sectionId = String(req.params.sectionId);

    const space = await getSpaceById(spaceId);
    if (!space) {
      res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }

    const parsed = SectionWriteSchema.safeParse(req.body);
    if (!parsed.success) { zodError(res, parsed.error); return; }
    const body = parsed.data;

    const section = await upsertSection(spaceId, sectionId, {
      name: body.name,
      description: body.description,
      driveFolderId: body.driveFolderId,
      sortOrder: body.sortOrder ?? 0,
    });

    const user = req.session.user!;
    await createAuditLog({
      userId: user.sub,
      userName: user.name,
      action: "UPDATE_SECTION",
      entityType: "SECTION",
      entityId: sectionId,
      details: JSON.stringify({ spaceId, ...body }),
    });

    res.json(section);
  },
);

// ---------------------------------------------------------------------------
// Sections — DELETE /admin/spaces/:spaceId/sections/:sectionId
// ---------------------------------------------------------------------------

router.delete(
  "/spaces/:spaceId/sections/:sectionId",
  async (req: Request, res: Response): Promise<void> => {
    const spaceId = String(req.params.spaceId);
    const sectionId = String(req.params.sectionId);

    const section = await getSectionById(spaceId, sectionId);
    if (!section) {
      res.status(404).json({ error: "Section not found", code: "SECTION_NOT_FOUND" });
      return;
    }

    await deleteSection(spaceId, sectionId);

    const user = req.session.user!;
    await createAuditLog({
      userId: user.sub,
      userName: user.name,
      action: "DELETE_SECTION",
      entityType: "SECTION",
      entityId: sectionId,
      details: JSON.stringify({ spaceId, sectionId }),
    });

    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// Backup & Import
// ---------------------------------------------------------------------------

router.get("/backup", async (_req: Request, res: Response): Promise<void> => {
  const backup = await getBackup();
  res.header("Content-Type", "application/json");
  res.header("Content-Disposition", `attachment; filename="snomed-spaces-backup-${new Date().toISOString().split('T')[0]}.json"`);
  res.send(JSON.stringify(backup, null, 2));
});

router.post("/import", async (req: Request, res: Response): Promise<void> => {
  try {
    const backup = req.body;
    if (!backup || typeof backup !== 'object' || !Array.isArray(backup.spaces)) {
      res.status(400).json({ error: "Invalid backup format", code: "INVALID_BACKUP" });
      return;
    }
    await restoreBackup(backup);

    const user = req.session.user!;
    await createAuditLog({
      userId: user.sub,
      userName: user.name,
      action: "RESTORE_BACKUP",
      entityType: "SITE",
      entityId: "SITE",
    });

    res.json({ message: "Backup restored successfully" });
  } catch (err) {
    res.status(500).json({ error: "Import failed", code: "IMPORT_FAILED" });
  }
});

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

router.get("/audit-logs", async (req: Request, res: Response): Promise<void> => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
  const logs = await getAuditLogs(limit);
  res.json(logs);
});

export default router;
