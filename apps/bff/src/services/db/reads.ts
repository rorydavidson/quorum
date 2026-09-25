// Split out of the former single services/db.ts. Import via services/db.js (barrel).
import type { DocumentReader } from "@snomed/types";
import db from "./client.js";

// ---------------------------------------------------------------------------
// Document Read Receipts
// ---------------------------------------------------------------------------

interface DocumentReadRow {
  file_id: string;
  space_id: string;
  user_id: string;
  user_name: string;
  read_at: string;
}

/** Marks a document as read by a user (idempotent — refreshes read_at). */
export async function markDocumentRead(
  fileId: string,
  spaceId: string,
  userId: string,
  userName: string,
): Promise<void> {
  const existing = await db<DocumentReadRow>("document_reads")
    .where({ file_id: fileId, user_id: userId })
    .first();

  if (existing) {
    await db<DocumentReadRow>("document_reads")
      .where({ file_id: fileId, user_id: userId })
      .update({ read_at: db.fn.now(), space_id: spaceId, user_name: userName });
  } else {
    await db<DocumentReadRow>("document_reads").insert({
      file_id: fileId,
      space_id: spaceId,
      user_id: userId,
      user_name: userName,
    });
  }
}

/** Removes a user's read receipt for a document. */
export async function unmarkDocumentRead(
  fileId: string,
  userId: string,
): Promise<void> {
  await db<DocumentReadRow>("document_reads")
    .where({ file_id: fileId, user_id: userId })
    .delete();
}

/** Returns the set of file IDs a user has marked read within a space. */
export async function getUserReadFileIds(
  spaceId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db<DocumentReadRow>("document_reads")
    .where({ space_id: spaceId, user_id: userId })
    .select("file_id");
  return rows.map((r) => r.file_id);
}

/** Returns everyone who has marked a given document read, most recent first. */
export async function getDocumentReaders(
  fileId: string,
): Promise<DocumentReader[]> {
  const rows = await db<DocumentReadRow>("document_reads")
    .where({ file_id: fileId })
    .orderBy("read_at", "desc");
  return rows.map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    readAt: r.read_at,
  }));
}

