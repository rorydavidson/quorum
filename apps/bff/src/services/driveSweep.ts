import type { SpaceConfig } from "@snomed/types";
import {
  getSpaces,
  markDriveFileSeen,
  isSweepBootstrapped,
  markSweepBootstrapped,
} from "./db.js";
import { listFiles, isDriveMockMode } from "./drive.js";
import { notifyActivity } from "./notifications.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Drive polling sweep.
//
// "Notify me" emails fire on portal actions (upload, Official Record, meeting
// doc link) — but documents added *directly in Google Drive* bypass the portal
// entirely. This sweep periodically lists each space's Drive folders, diffs
// against the seen-set in drive_seen_files, and notifies subscribers about
// anything new.
//
// Safety properties:
//  - First sweep of a space seeds the seen-set silently (bootstrap) so
//    pre-existing files never cause a notification storm.
//  - markDriveFileSeen is an atomic PK insert, so with multiple BFF instances
//    at most one wins a given file and sends the email.
//  - Portal uploads / Official Record copies mark their file ids seen at
//    creation time, so the sweep never double-notifies portal activity.
//  - Disabled in mock mode (no real Drive) and in tests.
//
// Config: DRIVE_SWEEP_INTERVAL (seconds, default 600, 0 disables).
// ---------------------------------------------------------------------------

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Sweeps one space; returns how many new files were notified. */
async function sweepSpace(space: SpaceConfig): Promise<number> {
  const folderIds = [
    space.driveFolderId,
    ...space.sections.map((s) => s.driveFolderId),
  ].filter((id, i, all) => id && all.indexOf(id) === i);

  const listings = await Promise.allSettled(folderIds.map((id) => listFiles(id)));
  const files = listings
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof listFiles>>> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .filter((f) => f.id && f.mimeType !== FOLDER_MIME);
  const failures = listings.filter((r) => r.status === "rejected").length;
  if (failures > 0) {
    logger.warn({ spaceId: space.id, failures }, "Drive sweep: some folder listings failed");
  }

  // Bootstrap: seed silently so existing files never trigger emails.
  const bootstrapped = await isSweepBootstrapped(space.id);
  if (!bootstrapped) {
    for (const f of files) await markDriveFileSeen(space.id, f.id);
    await markSweepBootstrapped(space.id);
    logger.info(
      { spaceId: space.id, seeded: files.length },
      "Drive sweep: bootstrapped space (seeded without notifying)",
    );
    return 0;
  }

  let notified = 0;
  for (const f of files) {
    const isNew = await markDriveFileSeen(space.id, f.id);
    if (!isNew) continue;

    notified += 1;
    await notifyActivity({
      spaceId: space.id,
      spaceName: space.name,
      type: f.isOfficialRecord ? "NEW_OFFICIAL_RECORD" : "NEW_DOCUMENT",
      title: `New document: ${f.name}`,
      link: `/spaces/${space.id}/documents`,
      entityId: f.id,
      // No actor — the file appeared in Drive outside the portal.
    });
  }
  return notified;
}

/** One full sweep across all spaces. Never throws. */
export async function runDriveSweep(): Promise<void> {
  try {
    const spaces = await getSpaces();
    let totalNotified = 0;
    for (const space of spaces) {
      try {
        totalNotified += await sweepSpace(space);
      } catch (err) {
        logger.warn({ err, spaceId: space.id }, "Drive sweep failed for space");
      }
    }
    if (totalNotified > 0) {
      logger.info({ notified: totalNotified }, "Drive sweep: notified new files");
    } else {
      logger.debug("Drive sweep: no new files");
    }
  } catch (err) {
    logger.error({ err }, "Drive sweep failed");
  }
}

let _timer: NodeJS.Timeout | null = null;
let _running = false;

/**
 * Starts the periodic sweep. No-op when disabled (interval 0), in mock mode,
 * or in tests. Overlapping runs are skipped.
 */
export function startDriveSweep(): void {
  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const intervalSec = parseInt(process.env.DRIVE_SWEEP_INTERVAL ?? "600", 10);

  if (isTest || !Number.isFinite(intervalSec) || intervalSec <= 0) return;
  if (isDriveMockMode()) {
    logger.info("Drive sweep disabled — Drive is in mock mode (no Service Account)");
    return;
  }
  if (_timer) return;

  logger.info({ intervalSec }, "Drive sweep enabled");
  _timer = setInterval(async () => {
    if (_running) return; // previous sweep still in flight
    _running = true;
    try {
      await runDriveSweep();
    } finally {
      _running = false;
    }
  }, intervalSec * 1000);
  _timer.unref(); // never keep the process alive just for the sweep
}

export function stopDriveSweep(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
