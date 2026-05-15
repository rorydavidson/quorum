import { v4 as uuid } from "uuid";
import db from "./db.js";
import type { PortalDocument, DocumentVersion, DocumentType, DocumentStatus } from "@snomed/types";

// ---------------------------------------------------------------------------
// Schema migration — called from db.ts runMigrations()
// ---------------------------------------------------------------------------

export async function runAuthoredDocMigrations(): Promise<void> {
  const hasDocs = await db.schema.hasTable("documents");
  if (!hasDocs) {
    await db.schema.createTable("documents", (t) => {
      t.string("id").primary();
      t.string("space_id")
        .notNullable()
        .references("id")
        .inTable("spaces")
        .onDelete("CASCADE");
      t.string("title").notNullable();
      t.string("doc_type").notNullable().defaultTo("general");
      t.string("status").notNullable().defaultTo("draft");
      t.string("created_by").notNullable();
      t.string("created_by_name").notNullable();
      t.timestamp("created_at").notNullable().defaultTo(db.fn.now());
      t.timestamp("updated_at").notNullable().defaultTo(db.fn.now());
      t.text("content").notNullable().defaultTo("");
      t.text("content_html").notNullable().defaultTo("");
      t.string("locked_by").nullable();
      t.string("locked_by_name").nullable();
      t.timestamp("locked_at").nullable();
    });
    console.log("[db] Created documents table");
  }

  const hasSectionId = await db.schema.hasColumn("documents", "section_id");
  if (!hasSectionId) {
    await db.schema.alterTable("documents", (t) => {
      t.string("section_id").nullable();
    });
    console.log("[db] Added section_id column to documents table");
  }

  // Drop legacy folder column if it exists
  const hasFolder = await db.schema.hasColumn("documents", "folder");
  if (hasFolder) {
    await db.schema.alterTable("documents", (t) => {
      t.dropColumn("folder");
    });
    console.log("[db] Dropped legacy folder column from documents table");
  }

  const hasVersions = await db.schema.hasTable("document_versions");
  if (!hasVersions) {
    await db.schema.createTable("document_versions", (t) => {
      t.increments("id").primary();
      t.string("document_id")
        .notNullable()
        .references("id")
        .inTable("documents")
        .onDelete("CASCADE");
      t.integer("version_number").notNullable();
      t.text("content").notNullable();
      t.text("content_html").notNullable().defaultTo("");
      t.string("created_by").notNullable();
      t.string("created_by_name").notNullable();
      t.timestamp("created_at").notNullable().defaultTo(db.fn.now());
      t.text("change_summary").nullable();
    });
    console.log("[db] Created document_versions table");
  }
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface DocumentRow {
  id: string;
  space_id: string;
  title: string;
  doc_type: string;
  status: string;
  section_id: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  content: string;
  content_html: string;
  locked_by: string | null;
  locked_by_name: string | null;
  locked_at: string | null;
  section_name?: string;
}

interface VersionRow {
  id: number;
  document_id: string;
  version_number: number;
  content: string;
  content_html: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  change_summary: string | null;
}

// ---------------------------------------------------------------------------
// Row → domain conversions
// ---------------------------------------------------------------------------

function rowToDocument(row: DocumentRow, includeContent = false): PortalDocument {
  const doc: PortalDocument = {
    id: row.id,
    spaceId: row.space_id,
    title: row.title,
    docType: row.doc_type as DocumentType,
    status: row.status as DocumentStatus,
    sectionId: row.section_id ?? undefined,
    sectionName: row.section_name ?? undefined,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockedBy: row.locked_by ?? undefined,
    lockedByName: row.locked_by_name ?? undefined,
    lockedAt: row.locked_at ?? undefined,
  };
  if (includeContent) {
    doc.content = row.content;
    doc.contentHtml = row.content_html;
  }
  return doc;
}

function rowToVersion(row: VersionRow, includeContent = false): DocumentVersion {
  const ver: DocumentVersion = {
    id: row.id,
    documentId: row.document_id,
    versionNumber: row.version_number,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    changeSummary: row.change_summary ?? undefined,
  };
  if (includeContent) {
    ver.content = row.content;
    ver.contentHtml = row.content_html;
  }
  return ver;
}

// ---------------------------------------------------------------------------
// CRUD — Documents
// ---------------------------------------------------------------------------

export async function createDocument(
  spaceId: string,
  title: string,
  docType: DocumentType,
  userId: string,
  userName: string,
  sectionId?: string,
): Promise<PortalDocument> {
  const id = uuid();
  const now = new Date().toISOString();
  const row: DocumentRow = {
    id,
    space_id: spaceId,
    title,
    doc_type: docType,
    status: "draft",
    section_id: sectionId ?? null,
    created_by: userId,
    created_by_name: userName,
    created_at: now,
    updated_at: now,
    content: "",
    content_html: "",
    locked_by: null,
    locked_by_name: null,
    locked_at: null,
  };
  await db("documents").insert(row);
  return rowToDocument(row, false);
}

export async function updateDocumentSection(docId: string, sectionId: string | null): Promise<void> {
  await db("documents").where({ id: docId }).update({
    section_id: sectionId,
    updated_at: new Date().toISOString(),
  });
}

export async function getDocumentsBySpace(spaceId: string): Promise<PortalDocument[]> {
  const rows = await db<DocumentRow>("documents")
    .leftJoin("space_sections", function () {
      this.on("documents.section_id", "=", "space_sections.id")
        .andOn("documents.space_id", "=", "space_sections.space_id");
    })
    .where("documents.space_id", spaceId)
    .select("documents.*", "space_sections.name as section_name")
    .orderBy("documents.updated_at", "desc");
  return rows.map((r) => rowToDocument(r, false));
}

export async function getDocumentById(docId: string): Promise<PortalDocument | undefined> {
  const row = await db<DocumentRow>("documents").where({ id: docId }).first();
  return row ? rowToDocument(row, true) : undefined;
}

export async function updateDocumentContent(
  docId: string,
  content: string,
  contentHtml: string,
): Promise<void> {
  await db("documents").where({ id: docId }).update({
    content,
    content_html: contentHtml,
    updated_at: new Date().toISOString(),
  });
}

export async function updateDocumentTitle(docId: string, title: string): Promise<void> {
  await db("documents").where({ id: docId }).update({
    title,
    updated_at: new Date().toISOString(),
  });
}

export async function updateDocumentStatus(docId: string, status: DocumentStatus): Promise<void> {
  await db("documents").where({ id: docId }).update({
    status,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteDocument(docId: string): Promise<void> {
  await db("documents").where({ id: docId }).delete();
}

// ---------------------------------------------------------------------------
// Locking (Phase 1 — pessimistic single-user locking)
// ---------------------------------------------------------------------------

const LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function acquireLock(
  docId: string,
  userId: string,
  userName: string,
): Promise<boolean> {
  const doc = await db<DocumentRow>("documents").where({ id: docId }).first();
  if (!doc) return false;

  if (doc.locked_by && doc.locked_by !== userId) {
    const lockedAt = new Date(doc.locked_at!).getTime();
    if (Date.now() - lockedAt < LOCK_TIMEOUT_MS) {
      return false;
    }
  }

  await db("documents").where({ id: docId }).update({
    locked_by: userId,
    locked_by_name: userName,
    locked_at: new Date().toISOString(),
  });
  return true;
}

export async function releaseLock(docId: string, userId: string): Promise<void> {
  await db("documents")
    .where({ id: docId, locked_by: userId })
    .update({
      locked_by: null,
      locked_by_name: null,
      locked_at: null,
    });
}

export async function forceReleaseLock(docId: string): Promise<void> {
  await db("documents").where({ id: docId }).update({
    locked_by: null,
    locked_by_name: null,
    locked_at: null,
  });
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export async function createVersion(
  docId: string,
  userId: string,
  userName: string,
  changeSummary?: string,
): Promise<DocumentVersion> {
  const doc = await db<DocumentRow>("documents").where({ id: docId }).first();
  if (!doc) throw new Error("Document not found");

  const lastVersion = await db<VersionRow>("document_versions")
    .where({ document_id: docId })
    .orderBy("version_number", "desc")
    .first();

  const versionNumber = (lastVersion?.version_number ?? 0) + 1;

  const [inserted] = await db("document_versions")
    .insert({
      document_id: docId,
      version_number: versionNumber,
      content: doc.content,
      content_html: doc.content_html,
      created_by: userId,
      created_by_name: userName,
      change_summary: changeSummary ?? null,
    })
    .returning("*");

  if (inserted) return rowToVersion(inserted, false);

  const row = await db<VersionRow>("document_versions")
    .where({ document_id: docId, version_number: versionNumber })
    .first();
  return rowToVersion(row!, false);
}

export async function getVersions(docId: string): Promise<DocumentVersion[]> {
  const rows = await db<VersionRow>("document_versions")
    .where({ document_id: docId })
    .orderBy("version_number", "desc");
  return rows.map((r) => rowToVersion(r, false));
}

export async function getVersionById(versionId: number): Promise<DocumentVersion | undefined> {
  const row = await db<VersionRow>("document_versions")
    .where({ id: versionId })
    .first();
  return row ? rowToVersion(row, true) : undefined;
}
