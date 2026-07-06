import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DriveFile, SpaceConfig } from "@snomed/types";

vi.mock("./db.js", () => ({
  getSpaces: vi.fn(),
  markDriveFileSeen: vi.fn(),
  isSweepBootstrapped: vi.fn(),
  markSweepBootstrapped: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./drive.js", () => ({
  listFiles: vi.fn(),
  isDriveMockMode: vi.fn().mockReturnValue(false),
}));
vi.mock("./notifications.js", () => ({
  notifyActivity: vi.fn().mockResolvedValue(0),
}));

import * as db from "./db.js";
import * as drive from "./drive.js";
import * as notifications from "./notifications.js";
import { runDriveSweep } from "./driveSweep.js";

function file(id: string, name: string, opts: Partial<DriveFile> = {}): DriveFile {
  return {
    id,
    name,
    mimeType: "application/pdf",
    createdTime: "2026-07-01T00:00:00Z",
    modifiedTime: "2026-07-01T00:00:00Z",
    isOfficialRecord: false,
    ...opts,
  };
}

const SPACE: SpaceConfig = {
  id: "board",
  name: "Board",
  keycloakGroup: "/board-members",
  driveFolderId: "root-1",
  hierarchyCategory: "Board Level",
  uploadGroups: [],
  sortOrder: 0,
  sections: [{ id: "agendas", name: "Agendas", driveFolderId: "sec-1", sortOrder: 0 }],
};

describe("runDriveSweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getSpaces).mockResolvedValue([SPACE]);
    vi.mocked(db.isSweepBootstrapped).mockResolvedValue(true);
    vi.mocked(db.markDriveFileSeen).mockResolvedValue(true);
    vi.mocked(drive.listFiles).mockResolvedValue([]);
  });

  it("bootstraps a new space silently (seeds seen-set, no notifications)", async () => {
    vi.mocked(db.isSweepBootstrapped).mockResolvedValue(false);
    vi.mocked(drive.listFiles).mockResolvedValue([file("f1", "Old.pdf"), file("f2", "Older.pdf")]);

    await runDriveSweep();

    // Both folders (root + section) listed; both files seeded; bootstrap marked.
    expect(drive.listFiles).toHaveBeenCalledWith("root-1");
    expect(drive.listFiles).toHaveBeenCalledWith("sec-1");
    expect(db.markDriveFileSeen).toHaveBeenCalled();
    expect(db.markSweepBootstrapped).toHaveBeenCalledWith("board");
    expect(notifications.notifyActivity).not.toHaveBeenCalled();
  });

  it("notifies subscribers about a genuinely new file after bootstrap", async () => {
    vi.mocked(drive.listFiles).mockResolvedValueOnce([file("f-new", "Fresh.pdf")]).mockResolvedValue([]);

    await runDriveSweep();

    expect(notifications.notifyActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: "board",
        type: "NEW_DOCUMENT",
        title: "New document: Fresh.pdf",
        entityId: "f-new",
      }),
    );
    // Drive-added files have no portal actor.
    expect(vi.mocked(notifications.notifyActivity).mock.calls[0][0]).not.toHaveProperty("actorUserId");
  });

  it("classifies Official Records", async () => {
    vi.mocked(drive.listFiles)
      .mockResolvedValueOnce([file("f-rec", "_OFFICIAL_RECORD_2026-07-01_x.pdf", { isOfficialRecord: true })])
      .mockResolvedValue([]);

    await runDriveSweep();

    expect(notifications.notifyActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "NEW_OFFICIAL_RECORD" }),
    );
  });

  it("does not notify for files already seen (e.g. portal uploads or another instance)", async () => {
    vi.mocked(drive.listFiles).mockResolvedValueOnce([file("f-dup", "Dup.pdf")]).mockResolvedValue([]);
    vi.mocked(db.markDriveFileSeen).mockResolvedValue(false);

    await runDriveSweep();

    expect(notifications.notifyActivity).not.toHaveBeenCalled();
  });

  it("skips folders", async () => {
    vi.mocked(drive.listFiles)
      .mockResolvedValueOnce([file("sub", "Sub", { mimeType: "application/vnd.google-apps.folder" })])
      .mockResolvedValue([]);

    await runDriveSweep();

    expect(db.markDriveFileSeen).not.toHaveBeenCalled();
    expect(notifications.notifyActivity).not.toHaveBeenCalled();
  });

  it("survives a space whose listings fail", async () => {
    vi.mocked(drive.listFiles).mockRejectedValue(new Error("Drive down"));
    await expect(runDriveSweep()).resolves.toBeUndefined();
    expect(notifications.notifyActivity).not.toHaveBeenCalled();
  });
});
