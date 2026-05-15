import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getSpaceById, createAuditLog } from "../services/db.js";
import {
  createDocument,
  getDocumentsBySpace,
  getDocumentById,
  updateDocumentContent,
  updateDocumentTitle,
  updateDocumentSection,
  updateDocumentStatus,
  deleteDocument,
  acquireLock,
  releaseLock,
  forceReleaseLock,
  createVersion,
  getVersions,
  getVersionById,
} from "../services/authored-documents.js";
import { userCanAccessSpace, isAdminUser, userCanUpload } from "../utils/auth-helpers.js";
import type { DocumentType, DocumentStatus } from "@snomed/types";

const router: IRouter = Router();

router.use(requireAuth);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const VALID_DOC_TYPES = new Set<DocumentType>(["agenda", "resolution", "minutes", "general"]);
const VALID_STATUSES = new Set<DocumentStatus>(["draft", "review", "approved", "archived"]);

async function resolveSpaceAccess(
  req: Request,
  res: Response,
  requireUpload = false,
): Promise<{ spaceId: string; userId: string; userName: string } | null> {
  const user = req.session.user!;
  const spaceId = String(req.params.spaceId);
  const space = await getSpaceById(spaceId);

  if (!space) {
    res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
    return null;
  }

  const admin = isAdminUser(user.groups);
  if (!userCanAccessSpace(user.groups, space.keycloakGroup, admin)) {
    res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
    return null;
  }

  if (requireUpload && !userCanUpload(user.groups, space.uploadGroups ?? [], admin)) {
    res.status(403).json({ error: "Write access denied", code: "WRITE_FORBIDDEN" });
    return null;
  }

  return { spaceId: space.id, userId: user.sub, userName: user.name };
}

// ---------------------------------------------------------------------------
// GET /authored-docs/:spaceId — list documents in space
// ---------------------------------------------------------------------------

router.get(
  "/:spaceId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ctx = await resolveSpaceAccess(req, res);
    if (!ctx) return;
    const docs = await getDocumentsBySpace(ctx.spaceId);
    res.json(docs);
  }),
);

// ---------------------------------------------------------------------------
// POST /authored-docs/:spaceId — create document
// ---------------------------------------------------------------------------

router.post(
  "/:spaceId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ctx = await resolveSpaceAccess(req, res, true);
    if (!ctx) return;

    const { title, docType, sectionId } = req.body as { title?: string; docType?: string; sectionId?: string };
    if (!title || typeof title !== "string" || !title.trim()) {
      res.status(400).json({ error: "Title is required", code: "INVALID_TITLE" });
      return;
    }
    if (!docType || !VALID_DOC_TYPES.has(docType as DocumentType)) {
      res.status(400).json({ error: "Invalid document type", code: "INVALID_DOC_TYPE" });
      return;
    }

    const doc = await createDocument(ctx.spaceId, title.trim(), docType as DocumentType, ctx.userId, ctx.userName, sectionId || undefined);
    res.status(201).json(doc);

    await createAuditLog({
      userId: ctx.userId,
      userName: ctx.userName,
      action: "CREATE_DOCUMENT",
      entityType: "AUTHORED_DOCUMENT",
      entityId: doc.id,
      details: JSON.stringify({ spaceId: ctx.spaceId, title: title.trim(), docType }),
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /authored-docs/:spaceId/:docId — get document with content
// ---------------------------------------------------------------------------

router.get(
  "/:spaceId/:docId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ctx = await resolveSpaceAccess(req, res);
    if (!ctx) return;

    const doc = await getDocumentById(String(req.params.docId));
    if (!doc || doc.spaceId !== ctx.spaceId) {
      res.status(404).json({ error: "Document not found", code: "DOC_NOT_FOUND" });
      return;
    }

    res.json(doc);
  }),
);

// ---------------------------------------------------------------------------
// PUT /authored-docs/:spaceId/:docId — save content
// ---------------------------------------------------------------------------

router.put(
  "/:spaceId/:docId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ctx = await resolveSpaceAccess(req, res, true);
    if (!ctx) return;

    const docId = String(req.params.docId);
    const doc = await getDocumentById(docId);
    if (!doc || doc.spaceId !== ctx.spaceId) {
      res.status(404).json({ error: "Document not found", code: "DOC_NOT_FOUND" });
      return;
    }

    if (doc.status === "approved") {
      res.status(403).json({ error: "Approved documents are read-only", code: "DOC_APPROVED" });
      return;
    }

    if (doc.lockedBy && doc.lockedBy !== ctx.userId) {
      res.status(423).json({ error: `Document locked by ${doc.lockedByName}`, code: "DOC_LOCKED" });
      return;
    }

    const { content, contentHtml, title, sectionId } = req.body as {
      content?: string;
      contentHtml?: string;
      title?: string;
      sectionId?: string | null;
    };

    if (title && typeof title === "string" && title.trim()) {
      await updateDocumentTitle(docId, title.trim());
    }

    if (sectionId !== undefined) {
      await updateDocumentSection(docId, sectionId || null);
    }

    if (content !== undefined && contentHtml !== undefined) {
      await updateDocumentContent(docId, content, contentHtml);
    }

    const updated = await getDocumentById(docId);
    res.json(updated);

    await createAuditLog({
      userId: ctx.userId,
      userName: ctx.userName,
      action: "UPDATE_DOCUMENT",
      entityType: "AUTHORED_DOCUMENT",
      entityId: docId,
      details: JSON.stringify({ spaceId: ctx.spaceId }),
    });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /authored-docs/:spaceId/:docId/status — update status
// ---------------------------------------------------------------------------

router.patch(
  "/:spaceId/:docId/status",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ctx = await resolveSpaceAccess(req, res, true);
    if (!ctx) return;

    const docId = String(req.params.docId);
    const doc = await getDocumentById(docId);
    if (!doc || doc.spaceId !== ctx.spaceId) {
      res.status(404).json({ error: "Document not found", code: "DOC_NOT_FOUND" });
      return;
    }

    const { status } = req.body as { status?: string };
    if (!status || !VALID_STATUSES.has(status as DocumentStatus)) {
      res.status(400).json({ error: "Invalid status", code: "INVALID_STATUS" });
      return;
    }

    await updateDocumentStatus(docId, status as DocumentStatus);

    if (status === "approved") {
      await createVersion(docId, ctx.userId, ctx.userName, "Approved version");
    }

    const updated = await getDocumentById(docId);
    res.json(updated);

    await createAuditLog({
      userId: ctx.userId,
      userName: ctx.userName,
      action: "UPDATE_DOCUMENT_STATUS",
      entityType: "AUTHORED_DOCUMENT",
      entityId: docId,
      details: JSON.stringify({ spaceId: ctx.spaceId, from: doc.status, to: status }),
    });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /authored-docs/:spaceId/:docId — delete document
// ---------------------------------------------------------------------------

router.delete(
  "/:spaceId/:docId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ctx = await resolveSpaceAccess(req, res, true);
    if (!ctx) return;

    const docId = String(req.params.docId);
    const doc = await getDocumentById(docId);
    if (!doc || doc.spaceId !== ctx.spaceId) {
      res.status(404).json({ error: "Document not found", code: "DOC_NOT_FOUND" });
      return;
    }

    await deleteDocument(docId);
    res.status(204).end();

    await createAuditLog({
      userId: ctx.userId,
      userName: ctx.userName,
      action: "DELETE_DOCUMENT",
      entityType: "AUTHORED_DOCUMENT",
      entityId: docId,
      details: JSON.stringify({ spaceId: ctx.spaceId, title: doc.title }),
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /authored-docs/:spaceId/:docId/lock — acquire lock
// ---------------------------------------------------------------------------

router.post(
  "/:spaceId/:docId/lock",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ctx = await resolveSpaceAccess(req, res, true);
    if (!ctx) return;

    const docId = String(req.params.docId);
    const doc = await getDocumentById(docId);
    if (!doc || doc.spaceId !== ctx.spaceId) {
      res.status(404).json({ error: "Document not found", code: "DOC_NOT_FOUND" });
      return;
    }

    const acquired = await acquireLock(docId, ctx.userId, ctx.userName);
    if (!acquired) {
      res.status(423).json({
        error: `Document locked by ${doc.lockedByName}`,
        code: "DOC_LOCKED",
        lockedBy: doc.lockedByName,
      });
      return;
    }

    res.json({ locked: true });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /authored-docs/:spaceId/:docId/lock — release lock
// ---------------------------------------------------------------------------

router.delete(
  "/:spaceId/:docId/lock",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ctx = await resolveSpaceAccess(req, res, true);
    if (!ctx) return;

    const docId = String(req.params.docId);
    const admin = isAdminUser(req.session.user!.groups);

    if (admin) {
      await forceReleaseLock(docId);
    } else {
      await releaseLock(docId, ctx.userId);
    }

    res.json({ locked: false });
  }),
);

// ---------------------------------------------------------------------------
// GET /authored-docs/:spaceId/:docId/versions — list versions
// ---------------------------------------------------------------------------

router.get(
  "/:spaceId/:docId/versions",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ctx = await resolveSpaceAccess(req, res);
    if (!ctx) return;

    const docId = String(req.params.docId);
    const doc = await getDocumentById(docId);
    if (!doc || doc.spaceId !== ctx.spaceId) {
      res.status(404).json({ error: "Document not found", code: "DOC_NOT_FOUND" });
      return;
    }

    const versions = await getVersions(docId);
    res.json(versions);
  }),
);

// ---------------------------------------------------------------------------
// GET /authored-docs/:spaceId/:docId/versions/:versionId — get version content
// ---------------------------------------------------------------------------

router.get(
  "/:spaceId/:docId/versions/:versionId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ctx = await resolveSpaceAccess(req, res);
    if (!ctx) return;

    const versionId = parseInt(String(req.params.versionId), 10);
    if (isNaN(versionId)) {
      res.status(400).json({ error: "Invalid version ID", code: "INVALID_VERSION_ID" });
      return;
    }

    const version = await getVersionById(versionId);
    if (!version || version.documentId !== String(req.params.docId)) {
      res.status(404).json({ error: "Version not found", code: "VERSION_NOT_FOUND" });
      return;
    }

    res.json(version);
  }),
);

// ---------------------------------------------------------------------------
// POST /authored-docs/:spaceId/:docId/versions — create version snapshot
// ---------------------------------------------------------------------------

router.post(
  "/:spaceId/:docId/versions",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ctx = await resolveSpaceAccess(req, res, true);
    if (!ctx) return;

    const docId = String(req.params.docId);
    const doc = await getDocumentById(docId);
    if (!doc || doc.spaceId !== ctx.spaceId) {
      res.status(404).json({ error: "Document not found", code: "DOC_NOT_FOUND" });
      return;
    }

    const { changeSummary } = req.body as { changeSummary?: string };
    const version = await createVersion(docId, ctx.userId, ctx.userName, changeSummary);
    res.status(201).json(version);

    await createAuditLog({
      userId: ctx.userId,
      userName: ctx.userName,
      action: "VERSION_DOCUMENT",
      entityType: "AUTHORED_DOCUMENT",
      entityId: docId,
      details: JSON.stringify({ spaceId: ctx.spaceId, versionNumber: version.versionNumber }),
    });
  }),
);

export default router;
