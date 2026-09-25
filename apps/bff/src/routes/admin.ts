import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
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
  resetSite,
  createAuditLog,
  getAuditLogs,
  getCategoryConfigs,
  setCategoryConfigs,
  getUsageMetrics,
  getAllSubscriptions,
  markDriveFileSeen,
} from "../services/db.js";
import { sendMail, isMailerConfigured } from "../services/mailer.js";
import { reqLog } from "../services/logger.js";
import { AgendaItemSchema, HttpUrlOrEmptySchema, zodError } from "../utils/validation.js";
import { copyFileInDrive, verifyFileAncestry } from "../services/drive.js";
import { notifyActivity } from "../services/notifications.js";

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
  // Fetched server-side by the calendar service, so constrain the scheme to
  // https to reduce SSRF surface (blocks http://169.254.* metadata, file://, etc.).
  icalUrl: z
    .string()
    .max(2048)
    .refine(
      (v) => v === "" || /^https:\/\//i.test(v),
      "icalUrl must be an https URL",
    )
    .optional(),
  discourseCategorySlug: z.string().max(100).optional(),
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

// A backup file is admin-supplied JSON, but it still goes through the same
// validation as the individual admin forms: every space and section must be
// well-formed, icalUrl must be https (it is fetched server-side, so this is
// the SSRF guard), and defaults are filled in so nothing undefined reaches
// the DB layer.
const BackupSpaceSchema = SpaceWriteSchema.required({ id: true }).extend({
  uploadGroups: z.array(z.string().max(200)).default([]),
  sortOrder: z.number().int().min(0).default(0),
  sections: z
    .array(
      SectionWriteSchema.required({ id: true }).extend({
        sortOrder: z.number().int().min(0).default(0),
      }),
    )
    .default([]),
});

const BackupEventMetadataSchema = z.object({
  id: z.string().min(1).max(200),
  spaceId: z.string().min(1).max(100),
  googleDocUrl: HttpUrlOrEmptySchema.optional(),
  agendaItems: z.array(AgendaItemSchema).max(200).default([]),
});

const BackupSchema = z
  .object({
    version: z.number().int().default(1),
    timestamp: z.string().max(64).default(() => new Date().toISOString()),
    spaces: z.array(BackupSpaceSchema),
    eventMetadata: z.array(BackupEventMetadataSchema).default([]),
    categoryConfigs: z
      .array(
        z.object({
          name: z.string().min(1).max(200),
          sortOrder: z.number().int().min(0),
        }),
      )
      .optional(),
    subscriptions: z
      .array(
        z.object({
          userId: z.string().min(1).max(200),
          spaceId: z.string().min(1).max(100),
          email: z.string().email().max(320),
          createdAt: z.string().max(64),
        }),
      )
      .optional(),
  })
  .superRefine((backup, ctx) => {
    const spaceIds = new Set(backup.spaces.map((s) => s.id));
    backup.eventMetadata.forEach((meta, i) => {
      if (!spaceIds.has(meta.spaceId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["eventMetadata", i, "spaceId"],
          message: `references unknown space "${meta.spaceId}"`,
        });
      }
    });
  });

// All admin routes require auth + admin group
router.use(requireAuth);
router.use(requireAdmin);

// ---------------------------------------------------------------------------
// Spaces — GET /admin/spaces
// ---------------------------------------------------------------------------

router.get("/spaces", asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const spaces = await getSpaces();
  res.json(spaces);
}));

// ---------------------------------------------------------------------------
// Spaces — GET /admin/spaces/:id
// ---------------------------------------------------------------------------

router.get(
  "/spaces/:id",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const space = await getSpaceById(String(req.params.id));
    if (!space) {
      res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }
    res.json(space);
  }),
);

// ---------------------------------------------------------------------------
// Spaces — POST /admin/spaces  (create)
// ---------------------------------------------------------------------------

router.post("/spaces", asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
    discourseCategorySlug: body.discourseCategorySlug,
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
}));

// ---------------------------------------------------------------------------
// Spaces — PUT /admin/spaces/:id  (update)
// ---------------------------------------------------------------------------

router.put(
  "/spaces/:id",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
      discourseCategorySlug: body.discourseCategorySlug,
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
  }),
);

// ---------------------------------------------------------------------------
// Spaces — DELETE /admin/spaces/:id
// ---------------------------------------------------------------------------

router.delete(
  "/spaces/:id",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
  }),
);

// ---------------------------------------------------------------------------
// Sections — GET /admin/spaces/:spaceId/sections/:sectionId
// ---------------------------------------------------------------------------

router.get(
  "/spaces/:spaceId/sections/:sectionId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const section = await getSectionById(
      String(req.params.spaceId),
      String(req.params.sectionId),
    );
    if (!section) {
      res.status(404).json({ error: "Section not found", code: "SECTION_NOT_FOUND" });
      return;
    }
    res.json(section);
  }),
);

// ---------------------------------------------------------------------------
// Sections — POST /admin/spaces/:spaceId/sections  (create)
// ---------------------------------------------------------------------------

router.post(
  "/spaces/:spaceId/sections",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
  }),
);

// ---------------------------------------------------------------------------
// Sections — PUT /admin/spaces/:spaceId/sections/:sectionId  (update)
// ---------------------------------------------------------------------------

router.put(
  "/spaces/:spaceId/sections/:sectionId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
  }),
);

// ---------------------------------------------------------------------------
// Sections — DELETE /admin/spaces/:spaceId/sections/:sectionId
// ---------------------------------------------------------------------------

router.delete(
  "/spaces/:spaceId/sections/:sectionId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
  }),
);

// ---------------------------------------------------------------------------
// Official Records — per-document
// ---------------------------------------------------------------------------

const SnapshotBodySchema = z.object({
  fileName: z.string().min(1).max(500),
});

/**
 * POST /admin/spaces/:spaceId/files/:fileId/snapshot
 *
 * Creates an Official Record of a single document by copying it in the
 * space's Drive folder with a `_OFFICIAL_RECORD_YYYY-MM-DD_` prefix.
 *
 * Body: { fileName: string }
 * Returns: DriveFile (the newly created copy)
 */
router.post(
  "/spaces/:spaceId/files/:fileId/snapshot",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const spaceId = String(req.params.spaceId);
    const fileId = String(req.params.fileId);

    const parsed = SnapshotBodySchema.safeParse(req.body);
    if (!parsed.success) { zodError(res, parsed.error); return; }
    const { fileName } = parsed.data;

    // Guard: don't snapshot a file that is already an Official Record
    if (fileName.startsWith("_OFFICIAL_RECORD_")) {
      res.status(400).json({
        error: "This file is already an Official Record.",
        code: "ALREADY_OFFICIAL_RECORD",
      });
      return;
    }

    const space = await getSpaceById(spaceId);
    if (!space) {
      res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }

    // Verify the file actually lives within this space's Drive tree before
    // copying it — consistent with the download/delete ancestry checks and
    // prevents copying an arbitrary file the service account can see.
    const fileBelongs = await verifyFileAncestry(fileId, space.driveFolderId);
    if (!fileBelongs) {
      res.status(403).json({ error: "File is not within this space", code: "FILE_OUTSIDE_SPACE" });
      return;
    }

    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const newName = `_OFFICIAL_RECORD_${date}_${fileName}`;

    let copy;
    try {
      copy = await copyFileInDrive(fileId, newName, space.driveFolderId);
    } catch {
      res.status(502).json({ error: "Failed to copy file in Drive", code: "DRIVE_ERROR" });
      return;
    }

    const user = req.session.user!;
    await createAuditLog({
      userId: user.sub,
      userName: user.name,
      action: "CREATE_OFFICIAL_RECORD",
      entityType: "FILE",
      entityId: fileId,
      details: JSON.stringify({ spaceId, fileName, officialRecordName: newName }),
    });

    // Mark seen so the Drive polling sweep doesn't re-notify this copy
    void markDriveFileSeen(space.id, copy.id);

    void notifyActivity({
      spaceId: space.id,
      spaceName: space.name,
      type: "NEW_OFFICIAL_RECORD",
      title: `New Official Record: ${fileName}`,
      link: `/spaces/${space.id}/documents`,
      entityId: copy.id,
      actorName: user.name,
      actorUserId: user.sub,
    });

    res.status(201).json(copy);
  }),
);

// ---------------------------------------------------------------------------
// Backup & Import
// ---------------------------------------------------------------------------

router.get("/backup", asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const backup = await getBackup();
  res.header("Content-Type", "application/json");
  res.header("Content-Disposition", `attachment; filename="snomed-spaces-backup-${new Date().toISOString().split('T')[0]}.json"`);
  res.send(JSON.stringify(backup, null, 2));
}));

router.post("/import", asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = BackupSchema.safeParse(req.body);
  if (!parsed.success) { zodError(res, parsed.error); return; }

  try {
    await restoreBackup(parsed.data);
  } catch (err) {
    reqLog(req).error({ err }, "Backup restore failed");
    res.status(500).json({ error: "Import failed", code: "IMPORT_FAILED" });
    return;
  }

  const user = req.session.user!;
  await createAuditLog({
    userId: user.sub,
    userName: user.name,
    action: "RESTORE_BACKUP",
    entityType: "SITE",
    entityId: "SITE",
  });

  res.json({ message: "Backup restored successfully" });
}));

router.post("/reset", asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    await resetSite();

    const user = req.session.user!;
    await createAuditLog({
      userId: user.sub,
      userName: user.name,
      action: "RESET_SITE",
      entityType: "SITE",
      entityId: "SITE",
    });

    res.json({ message: "Site reset successfully" });
  } catch (err) {
    res.status(500).json({ error: "Reset failed", code: "RESET_FAILED" });
  }
}));

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

const AuditLogQuerySchema = z.object({
  action: z.string().max(100).optional(),
  entityType: z.string().max(50).optional(),
  user: z.string().max(200).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD").optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// Empty query-string values (?action=) should be treated as "no filter".
function cleanQuery(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

/** Escapes a single CSV field per RFC 4180. */
function csvField(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function auditLogsToCsv(logs: Awaited<ReturnType<typeof getAuditLogs>>): string {
  const header = ["timestamp", "userName", "userId", "action", "entityType", "entityId", "details"];
  const rows = logs.map((l) =>
    [l.timestamp, l.userName, l.userId, l.action, l.entityType, l.entityId, l.details ?? ""]
      .map(csvField)
      .join(","),
  );
  return [header.join(","), ...rows].join("\r\n");
}

// ---------------------------------------------------------------------------
// Usage metrics / analytics
// ---------------------------------------------------------------------------

router.get("/metrics", asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const metrics = await getUsageMetrics();
  res.json(metrics);
}));

// ---------------------------------------------------------------------------
// Notifications — admin visibility & delivery test
// ---------------------------------------------------------------------------

// GET /admin/subscriptions — who has clicked "Notify me", per space
router.get("/subscriptions", asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const subscriptions = await getAllSubscriptions();
  res.json({ subscriptions });
}));

/**
 * POST /admin/notifications/test
 * Sends a test email to the calling admin's own address through the configured
 * SMTP transport, so delivery can be verified end-to-end without needing a
 * second account or real space activity. Reports mock mode explicitly.
 */
router.post("/notifications/test", asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  if (!user.email) {
    res.status(400).json({ error: "Your account has no email address", code: "NO_EMAIL" });
    return;
  }

  const smtpConfigured = isMailerConfigured();
  const sent = await sendMail({
    to: user.email,
    subject: "[Quorum] Test notification",
    text:
      "This is a test notification from the Quorum governance portal.\n\n" +
      "If you are reading this, SMTP delivery is working. Subscribers of a space " +
      "receive emails like this when a new document, Official Record, or meeting " +
      "document is added to that space.",
    html:
      "<p>This is a <strong>test notification</strong> from the Quorum governance portal.</p>" +
      "<p>If you are reading this, SMTP delivery is working. Subscribers of a space " +
      "receive emails like this when a new document, Official Record, or meeting " +
      "document is added to that space.</p>",
  });

  res.json({ sent, smtpConfigured, to: user.email });
}));

router.get("/audit-logs", asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = AuditLogQuerySchema.safeParse(cleanQuery(req.query));
  if (!parsed.success) { zodError(res, parsed.error); return; }
  const logs = await getAuditLogs(parsed.data);
  res.json(logs);
}));

router.get("/audit-logs/export", asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = AuditLogQuerySchema.safeParse(cleanQuery(req.query));
  if (!parsed.success) { zodError(res, parsed.error); return; }

  // Export ignores pagination — dump the full filtered set (capped in the DB layer).
  const logs = await getAuditLogs({ ...parsed.data, limit: 5000, offset: 0 });
  const date = new Date().toISOString().split("T")[0];
  res.header("Content-Type", "text/csv; charset=utf-8");
  res.header(
    "Content-Disposition",
    `attachment; filename="quorum-audit-log-${date}.csv"`,
  );
  res.send(auditLogsToCsv(logs));
}));

// ---------------------------------------------------------------------------
// Hierarchy Category Configs
//
// GET  /admin/categories
//   Returns all configured category sort orders, merged with any category
//   names currently in use by spaces that have no explicit config entry.
//
// PUT  /admin/categories
//   Body: { entries: [{ name: string; sortOrder: number }] }
//   Bulk-replaces all category sort order entries in one transaction.
// ---------------------------------------------------------------------------

const CategoryOrderSchema = z.object({
  entries: z.array(
    z.object({
      name: z.string().min(1).max(200),
      sortOrder: z.number().int().min(0),
    }),
  ),
});

router.get("/categories", asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const [configs, spaces] = await Promise.all([getCategoryConfigs(), getSpaces()]);

  // Collect all category names currently used by spaces
  const allNames = new Set<string>(spaces.map((s) => s.hierarchyCategory));

  // Map configured entries by name for O(1) lookup
  const configMap = new Map(configs.map((c) => [c.name, c.sortOrder]));

  // Build merged list: configured entries keep their sortOrder;
  // unconfigured names get sortOrder = null (displayed separately in admin UI)
  const merged = Array.from(allNames).map((name) => ({
    name,
    sortOrder: configMap.get(name) ?? null,
  }));

  // Sort: configured ones first (by sortOrder), then unconfigured alphabetically
  merged.sort((a, b) => {
    if (a.sortOrder !== null && b.sortOrder !== null) return a.sortOrder - b.sortOrder;
    if (a.sortOrder !== null) return -1;
    if (b.sortOrder !== null) return 1;
    return a.name.localeCompare(b.name);
  });

  res.json(merged);
}));

router.put("/categories", asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = CategoryOrderSchema.safeParse(req.body);
  if (!parsed.success) { zodError(res, parsed.error); return; }

  await setCategoryConfigs(parsed.data.entries);

  const user = req.session.user!;
  await createAuditLog({
    userId: user.sub,
    userName: user.name,
    action: "UPDATE_CATEGORY_ORDER",
    entityType: "CATEGORY",
    entityId: "ALL",
    details: JSON.stringify(parsed.data.entries),
  });

  res.json({ message: "Category order saved." });
}));

export default router;
