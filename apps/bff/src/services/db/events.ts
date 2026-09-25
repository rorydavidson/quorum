// Split out of the former single services/db.ts. Import via services/db.js (barrel).
import type { EventMetadata } from "@snomed/types";
import db from "./client.js";
import { EventSpaceMismatchError } from "../errors.js";

// ---------------------------------------------------------------------------
// CRUD — Event Metadata
// ---------------------------------------------------------------------------

export interface EventMetadataRow {
  id: string;
  space_id: string;
  google_doc_url: string | null;
  agenda_items: string; // JSON
}

export function rowToEventMetadata(row: EventMetadataRow): EventMetadata {
  return {
    id: row.id,
    spaceId: row.space_id,
    googleDocUrl: row.google_doc_url ?? undefined,
    agendaItems: JSON.parse(row.agenda_items),
  };
}

/**
 * Fetch metadata for an event, scoped to the space the caller was authorised
 * for. A row that exists under another space is treated as not found.
 */
export async function getEventMetadata(
  id: string,
  spaceId: string,
): Promise<EventMetadata | undefined> {
  const row = await db<EventMetadataRow>("event_metadata")
    .where({ id, space_id: spaceId })
    .first();
  return row ? rowToEventMetadata(row) : undefined;
}

/**
 * Create or update metadata for an event within a space.
 * Throws EventSpaceMismatchError if the id already belongs to another space,
 * so a caller can never move or overwrite another space's record.
 */
export async function upsertEventMetadata(
  id: string,
  spaceId: string,
  payload: Partial<Omit<EventMetadata, "id" | "spaceId">>,
): Promise<EventMetadata> {
  const existing = await db<EventMetadataRow>("event_metadata")
    .where({ id })
    .first();

  if (existing && existing.space_id !== spaceId) {
    throw new EventSpaceMismatchError(id);
  }

  const rowToInsert: Partial<EventMetadataRow> = {
    id,
    space_id: spaceId,
  };

  if (payload.googleDocUrl !== undefined) {
    rowToInsert.google_doc_url = payload.googleDocUrl ?? null;
  }
  if (payload.agendaItems !== undefined) {
    rowToInsert.agenda_items = JSON.stringify(payload.agendaItems);
  }

  if (existing) {
    await db<EventMetadataRow>("event_metadata")
      .where({ id, space_id: spaceId })
      .update(rowToInsert);
  } else {
    // If inserting new, ensuring defaults
    if (rowToInsert.agenda_items === undefined) rowToInsert.agenda_items = "[]";
    await db<EventMetadataRow>("event_metadata").insert(
      rowToInsert as EventMetadataRow,
    );
  }

  const updated = await getEventMetadata(id, spaceId);
  return updated!;
}

