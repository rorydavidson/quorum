import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getSpaces, getSpaceById, getSectionById, createAuditLog, getCategoryConfigs } from "../services/db.js";
import { listFiles, downloadFile, uploadFile, deleteFile, createFolder } from "../services/drive.js";

// Allowed MIME types for uploads — documents and common office formats only
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  // Word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // PowerPoint
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Google Docs exports (Drive API uses these when downloading)
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  // Plain text / CSV
  "text/plain",
  "text/csv",
  // Images (for diagrams / attachments)
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

// multer: store upload on disk to avoid high memory usage for large files
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      // Use a unique name to avoid collisions in the temp dir
      cb(null, `quorum-${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' is not permitted`));
    }
  },
});

const router: IRouter = Router();

// All document routes require an active session
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helper: check whether the session user belongs to a space's keycloak group
// ---------------------------------------------------------------------------

export function userCanAccessSpace(
  userGroups: string[],
  spaceGroup: string,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  // Keycloak groups can be bare ("board-members") or path-prefixed ("/board-members")
  return userGroups.some(
    (g) =>
      g === spaceGroup ||
      g === spaceGroup.replace(/^\//, "") ||
      `/${g}` === spaceGroup,
  );
}

export function isAdminUser(groups: string[]): boolean {
  return groups.some((g) => g === "portal_admin" || g === "/portal_admin");
}

// ---------------------------------------------------------------------------
// GET /documents/categories — category sort-order config (auth required, no admin needed)
// Used by the spaces listing page to order category sections correctly.
// ---------------------------------------------------------------------------

router.get("/categories", asyncHandler(async (_req, res) => {
  const configs = await getCategoryConfigs();
  res.json(configs);
}));

// ---------------------------------------------------------------------------
// GET /documents — list all spaces the user can access
// ---------------------------------------------------------------------------

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  const admin = isAdminUser(user.groups);
  const allSpaces = await getSpaces();
  const accessible = admin
    ? allSpaces
    : allSpaces.filter((s) =>
      userCanAccessSpace(user.groups, s.keycloakGroup, false),
    );
  res.json(accessible);
});

// ---------------------------------------------------------------------------
// GET /documents/:spaceId — list files in a space's default Drive folder
// ---------------------------------------------------------------------------

router.get("/:spaceId", async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  const space = await getSpaceById(String(req.params.spaceId));

  if (!space) {
    res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
    return;
  }

  if (
    !userCanAccessSpace(
      user.groups,
      space.keycloakGroup,
      isAdminUser(user.groups),
    )
  ) {
    res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
    return;
  }

  try {
    const folderId = req.query.folderId as string | undefined;
    const targetFolderId = folderId || space.driveFolderId;
    const files = await listFiles(targetFolderId);
    res.json({ space, files });
  } catch (err) {
    console.error("[documents] Drive error:", err);
    res
      .status(502)
      .json({ error: "Failed to list files from Drive", code: "DRIVE_ERROR" });
  }
});

// ---------------------------------------------------------------------------
// GET /documents/:spaceId/meta — return space config only (no Drive call)
// ---------------------------------------------------------------------------

router.get("/:spaceId/meta", async (req: Request, res: Response): Promise<void> => {
  const user = req.session.user!;
  const space = await getSpaceById(String(req.params.spaceId));

  if (!space) {
    res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
    return;
  }

  if (!userCanAccessSpace(user.groups, space.keycloakGroup, isAdminUser(user.groups))) {
    res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
    return;
  }

  res.json({ space });
});

// ---------------------------------------------------------------------------
// GET /documents/:spaceId/sections/:sectionId — list files in a named section
// ---------------------------------------------------------------------------

router.get(
  "/:spaceId/sections/:sectionId",
  async (req: Request, res: Response): Promise<void> => {
    const user = req.session.user!;
    const spaceId = String(req.params.spaceId);
    const sectionId = String(req.params.sectionId);

    const space = await getSpaceById(spaceId);
    if (!space) {
      res
        .status(404)
        .json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }

    if (
      !userCanAccessSpace(
        user.groups,
        space.keycloakGroup,
        isAdminUser(user.groups),
      )
    ) {
      res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
      return;
    }

    const section = await getSectionById(spaceId, sectionId);
    if (!section) {
      res
        .status(404)
        .json({ error: "Section not found", code: "SECTION_NOT_FOUND" });
      return;
    }

    try {
      const folderId = req.query.folderId as string | undefined;
      const targetFolderId = folderId || section.driveFolderId;
      const files = await listFiles(targetFolderId);
      res.json({ space, section, files });
    } catch (err) {
      console.error("[documents] Drive error:", err);
      res.status(502).json({
        error: "Failed to list files from Drive",
        code: "DRIVE_ERROR",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /documents/:spaceId/:fileId/download — proxy file from Drive
// ---------------------------------------------------------------------------

router.get(
  "/:spaceId/:fileId/download",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.session.user!;
    const space = await getSpaceById(String(req.params.spaceId));

    if (!space) {
      res
        .status(404)
        .json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }

    if (
      !userCanAccessSpace(
        user.groups,
        space.keycloakGroup,
        isAdminUser(user.groups),
      )
    ) {
      res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
      return;
    }

    try {
      const { stream, mimeType, name } = await downloadFile(
        String(req.params.fileId),
      );
      // ?download=1 → force browser save-as dialog (attachment) regardless of type.
      // Without the flag: PDFs stream inline (so the in-portal PDF viewer can fetch them);
      // all other types are always forced to attachment.
      const forceDownload =
        req.query.download === "1" || req.query.download === "true";
      const disposition =
        forceDownload || mimeType !== "application/pdf"
          ? "attachment"
          : "inline";
      res.setHeader("Content-Type", mimeType);
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${encodeURIComponent(name)}"`,
      );

      // Handle stream errors (e.g. Drive timeout) mid-download
      stream.on("error", (err) => {
        console.error("[documents] Proxy stream error:", err);
        if (!res.headersSent) {
          res.status(502).json({ error: "Download failed midway", code: "STREAM_ERROR" });
        }
        res.end();
      });

      stream.pipe(res);
    } catch (err) {
      console.error("[documents] Download error:", err);
      res.status(502).json({
        error: "Failed to download file from Drive",
        code: "DRIVE_ERROR",
      });
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /documents/:spaceId/upload — upload a file to the space's Drive folder
// ---------------------------------------------------------------------------

/**
 * Wraps multer so that file-type rejections and size errors are returned as
 * clean JSON 400 responses rather than bubbling to the global error handler.
 */
function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "File too large (max 50 MB)"
          : err.message;
      res.status(400).json({ error: message, code: "UPLOAD_ERROR" });
      return;
    }
    if (err instanceof Error) {
      // fileFilter rejection or other upload error
      res.status(400).json({ error: err.message, code: "INVALID_FILE_TYPE" });
      return;
    }
    next();
  });
}

export function userCanUpload(
  userGroups: string[],
  uploadGroups: string[],
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  return uploadGroups.some((g) =>
    userGroups.some(
      (ug) => ug === g || ug === g.replace(/^\//, "") || `/${ug}` === g,
    ),
  );
}

router.post(
  "/:spaceId/upload",
  uploadSingle,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.session.user!;
    const space = await getSpaceById(String(req.params.spaceId));

    if (!space) {
      res
        .status(404)
        .json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }

    // Must be able to access the space AND be in an upload group
    if (
      !userCanAccessSpace(
        user.groups,
        space.keycloakGroup,
        isAdminUser(user.groups),
      )
    ) {
      res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
      return;
    }

    if (
      !userCanUpload(
        user.groups,
        space.uploadGroups ?? [],
        isAdminUser(user.groups),
      )
    ) {
      res
        .status(403)
        .json({ error: "Upload not permitted", code: "UPLOAD_FORBIDDEN" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided", code: "NO_FILE" });
      return;
    }

    try {
      // Priority: 1. folderId (subfolder), 2. sectionId (category folder), 3. space.driveFolderId (root)
      const folderId = req.query.folderId as string | undefined;
      const sectionId = req.query.sectionId as string | undefined;
      let targetFolderId = space.driveFolderId;

      if (folderId) {
        targetFolderId = folderId;
      } else if (sectionId) {
        const section = await getSectionById(space.id, sectionId);
        if (section) {
          targetFolderId = section.driveFolderId;
        }
      }

      // Create a read stream from the temp file on disk
      const stream = fs.createReadStream(file.path);

      // Register the error handler before any async work. libuv's lazy open
      // can fire after the temp file is unlinked — whether the upload succeeds
      // or throws — and without this handler the ENOENT becomes an uncaught
      // exception that fails the process.
      stream.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error("[documents] Unexpected stream error:", err);
        }
      });

      const driveFile = await uploadFile(
        targetFolderId,
        file.originalname,
        file.mimetype,
        stream,
        file.size,
      );

      stream.destroy();

      // Clean up the temp file after upload
      fs.unlink(file.path, (err) => {
        if (err) console.error("[documents] Failed to delete temp file:", file.path, err);
      });

      res.status(201).json(driveFile);

      // Audit Logging
      await createAuditLog({
        userId: user.sub,
        userName: user.name,
        action: "UPLOAD_DOCUMENT",
        entityType: "DOCUMENT",
        entityId: driveFile.id,
        details: JSON.stringify({
          spaceId: space.id,
          name: file.originalname,
          folderId: targetFolderId,
        }),
      });
    } catch (err) {
      console.error("[documents] Upload error:", err);
      // Best effort cleanup if upload fails
      fs.unlink(file.path, () => { });
      res
        .status(502)
        .json({ error: "Failed to upload file to Drive", code: "DRIVE_ERROR" });
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /documents/:spaceId/folders — create a folder in the space's Drive
// ---------------------------------------------------------------------------

router.post(
  "/:spaceId/folders",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.session.user!;
    const space = await getSpaceById(String(req.params.spaceId));

    if (!space) {
      res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }

    if (!userCanAccessSpace(user.groups, space.keycloakGroup, isAdminUser(user.groups))) {
      res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
      return;
    }

    if (!userCanUpload(user.groups, space.uploadGroups ?? [], isAdminUser(user.groups))) {
      res.status(403).json({ error: "Create folder not permitted", code: "FOLDER_FORBIDDEN" });
      return;
    }

    const { name } = req.body as { name?: unknown };
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Folder name is required", code: "INVALID_NAME" });
      return;
    }

    try {
      const folderId = req.query.folderId as string | undefined;
      const sectionId = req.query.sectionId as string | undefined;
      let targetFolderId = space.driveFolderId;

      if (folderId) {
        targetFolderId = folderId;
      } else if (sectionId) {
        const section = await getSectionById(space.id, sectionId);
        if (section) targetFolderId = section.driveFolderId;
      }

      const folder = await createFolder(targetFolderId, name.trim());
      res.status(201).json(folder);

      await createAuditLog({
        userId: user.sub,
        userName: user.name,
        action: "CREATE_FOLDER",
        entityType: "DOCUMENT",
        entityId: folder.id,
        details: JSON.stringify({ spaceId: space.id, name: name.trim(), folderId: targetFolderId }),
      });
    } catch (err) {
      console.error("[documents] Create folder error:", err);
      res.status(502).json({ error: "Failed to create folder in Drive", code: "DRIVE_ERROR" });
    }
  }),
);

// ---------------------------------------------------------------------------
// DELETE /documents/:spaceId/:fileId — delete a file from Drive
// ---------------------------------------------------------------------------

router.delete(
  "/:spaceId/:fileId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.session.user!;
    const spaceId = String(req.params.spaceId);
    const fileId = String(req.params.fileId);

    const space = await getSpaceById(spaceId);
    if (!space) {
      res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }

    // Must be able to access the space AND be in an upload group
    if (
      !userCanAccessSpace(
        user.groups,
        space.keycloakGroup,
        isAdminUser(user.groups),
      )
    ) {
      res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
      return;
    }

    if (
      !userCanUpload(
        user.groups,
        space.uploadGroups ?? [],
        isAdminUser(user.groups),
      )
    ) {
      res.status(403).json({ error: "Delete not permitted", code: "DELETE_FORBIDDEN" });
      return;
    }

    try {
      await deleteFile(fileId);

      res.status(204).end();

      // Audit Logging
      await createAuditLog({
        userId: user.sub,
        userName: user.name,
        action: "DELETE_DOCUMENT",
        entityType: "DOCUMENT",
        entityId: fileId,
        details: JSON.stringify({
          spaceId: space.id,
        }),
      });
    } catch (err) {
      console.error("[documents] Delete error:", err);
      res.status(502).json({ error: "Failed to delete file from Drive", code: "DRIVE_ERROR" });
    }
  }),
);

export default router;
