// Split out of the former single services/db.ts. Import via services/db.js (barrel).
import db from "./client.js";

// ---------------------------------------------------------------------------
// Drive sweep state
// ---------------------------------------------------------------------------

/**
 * Marks a Drive file as seen for a space. Returns true only when this call
 * inserted the row — i.e. the file was genuinely unseen. Uses
 * INSERT ... ON CONFLICT DO NOTHING RETURNING so the duplicate case is a
 * non-event (no constraint-violation ERROR in the Postgres server log) while
 * remaining atomic across concurrent BFF instances: RETURNING yields a row
 * only for the instance whose insert actually landed.
 */
export async function markDriveFileSeen(
  spaceId: string,
  fileId: string,
): Promise<boolean> {
  const inserted = await db("drive_seen_files")
    .insert({ space_id: spaceId, file_id: fileId })
    .onConflict(["space_id", "file_id"])
    .ignore()
    .returning("file_id");
  return inserted.length > 0;
}

/** True if the space's seen-set has been bootstrapped (first sweep done). */
export async function isSweepBootstrapped(spaceId: string): Promise<boolean> {
  const row = await db("drive_sweep_state").where({ space_id: spaceId }).first();
  return !!row;
}

/** Records that a space's first sweep has seeded the seen-set (idempotent). */
export async function markSweepBootstrapped(spaceId: string): Promise<void> {
  await db("drive_sweep_state")
    .insert({ space_id: spaceId })
    .onConflict("space_id")
    .ignore();
}

