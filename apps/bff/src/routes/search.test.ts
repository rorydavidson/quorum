/**
 * search.test.ts — integration tests for GET /search
 *
 * db, drive, and calendar services are all mocked.
 */

import express from "express";
import session from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type {
  SessionUser,
  SpaceConfig,
  DriveFile,
  CalendarEvent,
} from "@snomed/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../services/db.js", () => ({
  getSpaces: vi.fn(),
  getSpaceById: vi.fn(),
  getSpacesByGroups: vi.fn(),
  upsertSpace: vi.fn(),
  deleteSpace: vi.fn(),
  upsertSection: vi.fn(),
  getSectionById: vi.fn(),
  deleteSection: vi.fn(),
}));

vi.mock("../services/drive.js", () => ({
  searchFilesInFolders: vi.fn(),
  listFiles: vi.fn(),
  getFileMetadata: vi.fn(),
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  checkDriveAccess: vi.fn(),
}));

vi.mock("../services/calendar.js", () => ({
  getUpcomingEvents: vi.fn(),
  listEvents: vi.fn(),
}));

import * as db from "../services/db.js";
import * as driveService from "../services/drive.js";
import * as calendarService from "../services/calendar.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BOARD_SPACE: SpaceConfig = {
  id: "board",
  name: "Board",
  keycloakGroup: "/board-members",
  driveFolderId: "folder-board",
  calendarId: "board@group.calendar.google.com",
  hierarchyCategory: "Board Level",
  uploadGroups: [],
  sortOrder: 1,
  sections: [],
};

const TC_SPACE: SpaceConfig = {
  id: "tc",
  name: "Technical Committee",
  keycloakGroup: "/technical-committee",
  driveFolderId: "folder-tc",
  hierarchyCategory: "Working Groups",
  uploadGroups: [],
  sortOrder: 2,
  sections: [],
};

const MOCK_FILE: DriveFile = {
  id: "file-1",
  name: "Board Agenda.pdf",
  mimeType: "application/pdf",
  createdTime: "2026-01-01T00:00:00Z",
  modifiedTime: "2026-01-15T00:00:00Z",
  isOfficialRecord: false,
};

const OFFICIAL_FILE: DriveFile = {
  id: "file-2",
  name: "_OFFICIAL_RECORD_Annual-Report.pdf",
  mimeType: "application/pdf",
  createdTime: "2025-12-01T00:00:00Z",
  modifiedTime: "2025-12-15T00:00:00Z",
  isOfficialRecord: true,
};

const MOCK_EVENT: CalendarEvent = {
  id: "evt-1",
  summary: "Board Q1 Meeting",
  start: "2026-03-10T09:00:00Z",
  end: "2026-03-10T12:00:00Z",
  spaceId: "board",
  spaceName: "Board",
};

function makeUser(groups: string[]): SessionUser {
  return {
    sub: "u1",
    email: "u@example.com",
    name: "U",
    given_name: "U",
    family_name: "U",
    groups,
  };
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function createApp(user?: SessionUser) {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: "test-secret", resave: false, saveUninitialized: true }),
  );
  if (user) {
    app.use((req, _res, next) => {
      req.session.user = user;
      next();
    });
  }
  const { default: searchRouter } = await import("./search.js");
  app.use("/search", searchRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /search — auth", () => {
  it("returns 401 when no session user", async () => {
    const app = await createApp();
    const res = await request(app).get("/search?q=board");
    expect(res.status).toBe(401);
  });
});

describe("GET /search — short query guard", () => {
  it("returns [] for an empty query without calling any service", async () => {
    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/search?q=");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(driveService.searchFilesInFolders).not.toHaveBeenCalled();
  });

  it("returns [] for a single-character query", async () => {
    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/search?q=a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns [] when query param is missing", async () => {
    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/search");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /search — RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(driveService.searchFilesInFolders).mockResolvedValue([]);
    vi.mocked(calendarService.getUpcomingEvents).mockResolvedValue([]);
  });

  it("admin searches all spaces", async () => {
    vi.mocked(db.getSpaces).mockResolvedValue([BOARD_SPACE, TC_SPACE]);
    const app = await createApp(makeUser(["portal_admin"]));
    await request(app).get("/search?q=board");

    // searchFilesInFolders should be called once per space
    expect(vi.mocked(driveService.searchFilesInFolders)).toHaveBeenCalledTimes(
      2,
    );
  });

  it("non-admin only searches accessible spaces", async () => {
    vi.mocked(db.getSpaces).mockResolvedValue([BOARD_SPACE, TC_SPACE]);
    // User only belongs to /board-members
    const app = await createApp(makeUser(["/board-members"]));
    await request(app).get("/search?q=board");

    expect(vi.mocked(driveService.searchFilesInFolders)).toHaveBeenCalledTimes(
      1,
    );
    const callArgs = vi.mocked(driveService.searchFilesInFolders).mock.calls[0];
    expect(callArgs[0]).toContain("folder-board");
  });
});

describe("GET /search — result types", () => {
  beforeEach(() => {
    vi.mocked(db.getSpaces).mockResolvedValue([BOARD_SPACE]);
    vi.mocked(calendarService.getUpcomingEvents).mockResolvedValue([]);
  });

  it("returns type 'file' for normal files", async () => {
    vi.mocked(driveService.searchFilesInFolders).mockResolvedValue([MOCK_FILE]);
    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/search?q=board");

    expect(res.status).toBe(200);
    const fileResult = res.body.find(
      (r: { type: string }) => r.type === "file",
    );
    expect(fileResult).toBeDefined();
    expect(fileResult.data.id).toBe("file-1");
    expect(fileResult.spaceId).toBe("board");
    expect(fileResult.spaceName).toBe("Board");
  });

  it("returns type 'archive' for official records", async () => {
    vi.mocked(driveService.searchFilesInFolders).mockResolvedValue([
      OFFICIAL_FILE,
    ]);
    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/search?q=report");

    const archiveResult = res.body.find(
      (r: { type: string }) => r.type === "archive",
    );
    expect(archiveResult).toBeDefined();
    expect(archiveResult.data.id).toBe("file-2");
  });

  it("returns type 'event' for calendar events matching the query", async () => {
    vi.mocked(driveService.searchFilesInFolders).mockResolvedValue([]);
    vi.mocked(calendarService.getUpcomingEvents).mockResolvedValue([
      MOCK_EVENT,
    ]);

    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/search?q=board");

    const eventResult = res.body.find(
      (r: { type: string }) => r.type === "event",
    );
    expect(eventResult).toBeDefined();
    expect(eventResult.data.id).toBe("evt-1");
  });

  it("does not include calendar events that do not match the query text", async () => {
    vi.mocked(driveService.searchFilesInFolders).mockResolvedValue([]);
    vi.mocked(calendarService.getUpcomingEvents).mockResolvedValue([
      MOCK_EVENT,
    ]);

    const app = await createApp(makeUser(["portal_admin"]));
    // Query 'xyz' does not appear in MOCK_EVENT.summary
    const res = await request(app).get("/search?q=xyz-no-match");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe("GET /search — deduplication", () => {
  it("does not include the same file twice across spaces", async () => {
    const spaceA: SpaceConfig = {
      ...BOARD_SPACE,
      id: "spaceA",
      driveFolderId: "folderA",
    };
    const spaceB: SpaceConfig = {
      ...TC_SPACE,
      id: "spaceB",
      driveFolderId: "folderB",
      keycloakGroup: "/tc",
    };
    vi.mocked(db.getSpaces).mockResolvedValue([spaceA, spaceB]);
    vi.mocked(calendarService.getUpcomingEvents).mockResolvedValue([]);

    // Both spaces return the same file ID
    vi.mocked(driveService.searchFilesInFolders).mockResolvedValue([MOCK_FILE]);

    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/search?q=board");

    const fileIds = res.body.map((r: { data: DriveFile }) => r.data.id);
    const uniqueIds = [...new Set(fileIds)];
    expect(uniqueIds).toHaveLength(fileIds.length); // no duplicates
  });
});

describe("GET /search — result ordering", () => {
  it("returns file results before event results", async () => {
    vi.mocked(db.getSpaces).mockResolvedValue([BOARD_SPACE]);
    vi.mocked(driveService.searchFilesInFolders).mockResolvedValue([MOCK_FILE]);
    vi.mocked(calendarService.getUpcomingEvents).mockResolvedValue([
      MOCK_EVENT,
    ]);

    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/search?q=board");

    expect(res.status).toBe(200);
    const types = res.body.map((r: { type: string }) => r.type);
    // All 'file'/'archive' types should come before 'event' types
    const lastFile = Math.max(
      ...types.map((t: string, i: number) => (t !== "event" ? i : -1)),
    );
    const firstEvent = types.indexOf("event");
    if (firstEvent !== -1 && lastFile !== -1) {
      expect(lastFile).toBeLessThan(firstEvent);
    }
  });
});

describe("GET /search — error handling", () => {
  it("continues if one space's Drive search fails (Promise.allSettled)", async () => {
    const spaceA: SpaceConfig = {
      ...BOARD_SPACE,
      id: "spaceA",
      driveFolderId: "folderA",
    };
    const spaceB: SpaceConfig = {
      ...TC_SPACE,
      id: "spaceB",
      driveFolderId: "folderB",
      keycloakGroup: "/tc",
    };
    vi.mocked(db.getSpaces).mockResolvedValue([spaceA, spaceB]);
    vi.mocked(calendarService.getUpcomingEvents).mockResolvedValue([]);

    // First space search fails, second succeeds
    vi.mocked(driveService.searchFilesInFolders)
      .mockRejectedValueOnce(new Error("Drive error for spaceA"))
      .mockResolvedValueOnce([MOCK_FILE]);

    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/search?q=board");

    // Should still return results from the successful space
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("respects the ?limit parameter", async () => {
    vi.mocked(db.getSpaces).mockResolvedValue([BOARD_SPACE]);
    vi.mocked(calendarService.getUpcomingEvents).mockResolvedValue([]);
    // Return more files than the limit
    const manyFiles = Array.from({ length: 30 }, (_, i) => ({
      ...MOCK_FILE,
      id: `file-${i}`,
    }));
    vi.mocked(driveService.searchFilesInFolders).mockResolvedValue(manyFiles);

    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/search?q=board&limit=5");

    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(5);
  });
});
