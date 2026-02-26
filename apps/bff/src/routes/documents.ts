import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import { getSpaces, getSpaceById, getSectionById } from "../services/db.js";
import { listFiles, downloadFile, uploadFile } from "../services/drive.js";

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

// multer: store upload in memory so we can stream the buffer to Drive
const upload = multer({
  storage: multer.memoryStorage(),
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

function userCanAccessSpace(
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

function isAdminUser(groups: string[]): boolean {
  return groups.some((g) => g === "portal_admin" || g === "/portal_admin");
}

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
    const files = await listFiles(space.driveFolderId);
    res.json({ space, files });
  } catch (err) {
    console.error("[documents] Drive error:", err);
    res
      .status(502)
      .json({ error: "Failed to list files from Drive", code: "DRIVE_ERROR" });
  }
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
      const files = await listFiles(section.driveFolderId);
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
  async (req: Request, res: Response): Promise<void> => {
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
      stream.pipe(res);
    } catch (err) {
      console.error("[documents] Download error:", err);
      res.status(502).json({
        error: "Failed to download file from Drive",
        code: "DRIVE_ERROR",
      });
    }
  },
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

function userCanUpload(
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
  async (req: Request, res: Response): Promise<void> => {
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
      const driveFile = await uploadFile(
        space.driveFolderId,
        file.originalname,
        file.mimetype,
        file.buffer,
      );
      res.status(201).json(driveFile);
    } catch (err) {
      console.error("[documents] Upload error:", err);
      res
        .status(502)
        .json({ error: "Failed to upload file to Drive", code: "DRIVE_ERROR" });
    }
  },
);

export default router;
