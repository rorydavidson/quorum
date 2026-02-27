/**
 * documents-extra.test.ts
 *
 * Covers routes and error paths not exercised in documents.test.ts:
 *  - GET /:spaceId/:fileId/download  (stream proxy)
 *  - GET /:spaceId/sections/:sectionId  (section file listing)
 *  - POST /:spaceId/upload → Drive error (502 catch block)
 */

import { Readable } from "stream";
import express from "express";
import session from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { SessionUser, SpaceConfig, SpaceSection, DriveFile } from "@snomed/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../services/db.js", () => ({
  getSpaces: vi.fn(),
  getSpaceById: vi.fn(),
  getSpacesByGroups: vi.fn(),
  getSectionById: vi.fn(),
  upsertSpace: vi.fn(),
  deleteSpace: vi.fn(),
  upsertSection: vi.fn(),
  deleteSection: vi.fn(),
}));

vi.mock("../services/drive.js", () => ({
  listFiles: vi.fn(),
  getFileMetadata: vi.fn(),
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  searchFilesInFolders: vi.fn(),
  checkDriveAccess: vi.fn(),
}));

import * as db from "../services/db.js";
import * as driveService from "../services/drive.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BOARD_SPACE: SpaceConfig = {
  id: "board",
  name: "Board",
  keycloakGroup: "/board-members",
  driveFolderId: "folder-board",
  hierarchyCategory: "Board Level",
  uploadGroups: ["secretariat"],
  sortOrder: 1,
  sections: [],
};

const AGENDAS_SECTION: SpaceSection = {
  id: "sec-agendas",
  name: "Agendas",
  driveFolderId: "folder-agendas",
  sortOrder: 0,
};

const MOCK_FILE: DriveFile = {
  id: "file-1",
  name: "Agenda March 2026.pdf",
  mimeType: "application/pdf",
  createdTime: "2026-01-01T00:00:00Z",
  modifiedTime: "2026-03-01T00:00:00Z",
  isOfficialRecord: false,
};

function makeUser(groups: string[]): SessionUser {
  return { sub: "u1", email: "u@example.com", name: "U", given_name: "U", family_name: "U", groups };
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function createApp(user?: SessionUser) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-secret", resave: false, saveUninitialized: true }));
  if (user) {
    app.use((req, _res, next) => {
      req.session.user = user;
      next();
    });
  }
  const { default: docsRouter } = await import("./documents.js");
  app.use("/documents", docsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// GET /documents/:spaceId/:fileId/download
// ---------------------------------------------------------------------------

describe("GET /documents/:spaceId/:fileId/download", () => {
  beforeEach(() => {
    vi.mocked(db.getSpaceById).mockResolvedValue(BOARD_SPACE);
    vi.mocked(driveService.downloadFile).mockResolvedValue({
      stream: Readable.from(Buffer.from("%PDF-1.4 mock")),
      mimeType: "application/pdf",
      name: "Agenda.pdf",
    });
  });

  it("returns 401 when not authenticated", async () => {
    const app = await createApp();
    const res = await request(app).get("/documents/board/file-1/download");
    expect(res.status).toBe(401);
  });

  it("returns 404 when space does not exist", async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(undefined);
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).get("/documents/missing/file-1/download");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("SPACE_NOT_FOUND");
  });

  it("returns 403 when user cannot access the space", async () => {
    const app = await createApp(makeUser(["/other-group"]));
    const res = await request(app).get("/documents/board/file-1/download");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("streams the file inline for PDFs without ?download=1", async () => {
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).get("/documents/board/file-1/download");

    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("application/pdf");
    expect(res.header["content-disposition"]).toContain("inline");
    expect(res.header["content-disposition"]).toContain("Agenda.pdf");
  });

  it("forces attachment disposition when ?download=1", async () => {
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).get("/documents/board/file-1/download?download=1");

    expect(res.status).toBe(200);
    expect(res.header["content-disposition"]).toContain("attachment");
  });

  it("forces attachment for non-PDF mimeTypes even without ?download=1", async () => {
    vi.mocked(driveService.downloadFile).mockResolvedValue({
      stream: Readable.from(Buffer.from("xlsx content")),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name: "report.xlsx",
    });

    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).get("/documents/board/file-1/download");

    expect(res.header["content-disposition"]).toContain("attachment");
  });

  it("admin can download files from any space", async () => {
    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/documents/board/file-1/download");
    expect(res.status).toBe(200);
  });

  it("returns 502 when Drive download throws", async () => {
    vi.mocked(driveService.downloadFile).mockRejectedValueOnce(new Error("Drive unavailable"));
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).get("/documents/board/file-1/download");

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("DRIVE_ERROR");
  });
});

// ---------------------------------------------------------------------------
// GET /documents/:spaceId/sections/:sectionId
// ---------------------------------------------------------------------------

describe("GET /documents/:spaceId/sections/:sectionId", () => {
  beforeEach(() => {
    vi.mocked(db.getSpaceById).mockResolvedValue(BOARD_SPACE);
    vi.mocked(db.getSectionById).mockResolvedValue(AGENDAS_SECTION);
    vi.mocked(driveService.listFiles).mockResolvedValue([MOCK_FILE]);
  });

  it("returns 401 when not authenticated", async () => {
    const app = await createApp();
    const res = await request(app).get("/documents/board/sections/sec-agendas");
    expect(res.status).toBe(401);
  });

  it("returns 404 when space does not exist", async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(undefined);
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).get("/documents/missing/sections/sec-agendas");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("SPACE_NOT_FOUND");
  });

  it("returns 403 when user cannot access the space", async () => {
    const app = await createApp(makeUser(["/other-group"]));
    const res = await request(app).get("/documents/board/sections/sec-agendas");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("returns 404 when section does not exist", async () => {
    vi.mocked(db.getSectionById).mockResolvedValue(undefined);
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).get("/documents/board/sections/missing-sec");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("SECTION_NOT_FOUND");
  });

  it("returns 200 with space, section, and files on success", async () => {
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).get("/documents/board/sections/sec-agendas");

    expect(res.status).toBe(200);
    expect(res.body.space.id).toBe("board");
    expect(res.body.section.id).toBe("sec-agendas");
    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0].id).toBe("file-1");
  });

  it("admin can access sections in any space", async () => {
    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/documents/board/sections/sec-agendas");
    expect(res.status).toBe(200);
  });

  it("returns 502 when Drive listing throws", async () => {
    vi.mocked(driveService.listFiles).mockRejectedValueOnce(new Error("Drive timeout"));
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).get("/documents/board/sections/sec-agendas");

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("DRIVE_ERROR");
  });
});

// ---------------------------------------------------------------------------
// POST /documents/:spaceId/upload — Drive error path (lines 334-335)
// ---------------------------------------------------------------------------

describe("POST /documents/:spaceId/upload — Drive error", () => {
  it("returns 502 DRIVE_ERROR when uploadFile throws", async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue({
      ...BOARD_SPACE,
      uploadGroups: [], // admin will bypass this check
    });
    vi.mocked(driveService.uploadFile).mockRejectedValueOnce(
      new Error("Drive quota exceeded")
    );

    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app)
      .post("/documents/board/upload")
      .attach("file", Buffer.from("content"), {
        filename: "report.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("DRIVE_ERROR");
    expect(res.body.error).toContain("Failed to upload file to Drive");
  });
});
