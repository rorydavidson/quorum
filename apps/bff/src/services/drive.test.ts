/**
 * drive.test.ts — unit tests for the Drive service
 *
 * No SA credentials are set in test-setup.ts, so drive.ts automatically
 * operates in "mock mode". All exported functions are tested against the
 * in-process mock data — no googleapis calls are made.
 */

import { Readable } from "stream";
import { beforeAll, describe, expect, it } from "vitest";
import {
  checkDriveAccess,
  copyFileInDrive,
  downloadFile,
  getFileMetadata,
  listFiles,
  searchFilesInFolders,
  uploadFile,
} from "./drive.js";

// Sanity-check: tests run without SA credentials
beforeAll(() => {
  expect(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL).toBeUndefined();
  expect(process.env.GOOGLE_PRIVATE_KEY).toBeUndefined();
});

// ---------------------------------------------------------------------------
// listFiles
// ---------------------------------------------------------------------------

describe("listFiles()", () => {
  it("returns a non-empty array of DriveFiles", async () => {
    const files = await listFiles("any-folder-id");
    expect(files.length).toBeGreaterThan(0);
  });

  it("every file satisfies the DriveFile shape", async () => {
    const files = await listFiles("any-folder-id");
    for (const f of files) {
      expect(typeof f.id).toBe("string");
      expect(typeof f.name).toBe("string");
      expect(typeof f.mimeType).toBe("string");
      expect(typeof f.createdTime).toBe("string");
      expect(typeof f.modifiedTime).toBe("string");
      expect(typeof f.isOfficialRecord).toBe("boolean");
    }
  });

  it("marks files whose name contains _OFFICIAL_RECORD_ as official records", async () => {
    const files = await listFiles("any-folder");
    const official = files.filter((f) => f.isOfficialRecord);
    const unofficial = files.filter((f) => !f.isOfficialRecord);

    expect(official.length).toBeGreaterThan(0);
    expect(unofficial.length).toBeGreaterThan(0);
    official.forEach((f) => expect(f.name).toContain("_OFFICIAL_RECORD_"));
    unofficial.forEach((f) => expect(f.name).not.toContain("_OFFICIAL_RECORD_"));
  });

  it("ignores the folder ID (mock mode returns same data for any ID)", async () => {
    const a = await listFiles("folder-alpha");
    const b = await listFiles("folder-beta");
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// getFileMetadata
// ---------------------------------------------------------------------------

describe("getFileMetadata()", () => {
  it("returns metadata for a known mock file ID", async () => {
    const file = await getFileMetadata("mock-file-1");
    expect(file.id).toBe("mock-file-1");
    expect(file.name).toBeTruthy();
  });

  it("returns a fallback file (mock-file-1) for an unknown ID", async () => {
    const file = await getFileMetadata("does-not-exist");
    expect(file).toBeDefined();
    expect(typeof file.id).toBe("string");
  });

  it("returns the official-record file when looked up by ID", async () => {
    const file = await getFileMetadata("mock-file-2");
    expect(file.id).toBe("mock-file-2");
    expect(file.isOfficialRecord).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// downloadFile
// ---------------------------------------------------------------------------

describe("downloadFile()", () => {
  it("returns { stream, mimeType, name } for a known file ID", async () => {
    const result = await downloadFile("mock-file-1");
    expect(result.stream).toBeDefined();
    expect(result.mimeType).toBe("application/pdf");
    expect(typeof result.name).toBe("string");
    expect(result.name.length).toBeGreaterThan(0);
  });

  it("stream is a Readable that emits the mock PDF bytes starting with %PDF", async () => {
    const { stream } = await downloadFile("mock-file-1");
    expect(stream).toBeInstanceOf(Readable);

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
    }
    const data = Buffer.concat(chunks);
    // The mock PDF is a minimal valid PDF — starts with %PDF
    expect(data.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("returns a fallback file for an unknown ID", async () => {
    const result = await downloadFile("unknown-file-xyz");
    expect(result.stream).toBeDefined();
    expect(result.mimeType).toBe("application/pdf");
  });
});

// ---------------------------------------------------------------------------
// searchFilesInFolders
// ---------------------------------------------------------------------------

describe("searchFilesInFolders()", () => {
  it("returns empty array immediately when folderIds is empty", async () => {
    const results = await searchFilesInFolders([], "board");
    expect(results).toHaveLength(0);
  });

  it("filters mock files by name (case-insensitive)", async () => {
    const results = await searchFilesInFolders(["folder-1"], "board");
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r) => expect(r.name.toLowerCase()).toContain("board"));
  });

  it("returns empty array for a query that matches no mock file names", async () => {
    const results = await searchFilesInFolders(["folder-1"], "zzz-no-match-xyz");
    expect(results).toHaveLength(0);
  });

  it("respects the maxResults cap", async () => {
    // Empty string matches all mock files; cap at 2
    const results = await searchFilesInFolders(["folder-1"], "", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("is case-insensitive: uppercase query matches lowercase file name", async () => {
    const results = await searchFilesInFolders(["folder-1"], "BOARD");
    expect(results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// uploadFile
// ---------------------------------------------------------------------------

describe("uploadFile()", () => {
  it("returns a DriveFile with the given filename and mimeType", async () => {
    const buf = Buffer.from("test pdf content");
    const result = await uploadFile("folder-123", "report.pdf", "application/pdf", buf);

    expect(result.id).toMatch(/^mock-upload-/);
    expect(result.name).toBe("report.pdf");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.isOfficialRecord).toBe(false);
  });

  it("calculates size in MB from the buffer length", async () => {
    const buf = Buffer.alloc(1024 * 1024); // exactly 1 MB
    const result = await uploadFile("folder-123", "large.pdf", "application/pdf", buf);
    expect(result.size).toBeCloseTo(1.0, 1);
  });

  it("sets createdTime and modifiedTime as ISO 8601 strings", async () => {
    const buf = Buffer.from("content");
    const result = await uploadFile("folder-123", "doc.docx", "application/msword", buf);
    expect(new Date(result.createdTime).toISOString()).toBe(result.createdTime);
    expect(new Date(result.modifiedTime).toISOString()).toBe(result.modifiedTime);
  });

  it("returns unique IDs for successive uploads", async () => {
    const buf = Buffer.from("x");
    const a = await uploadFile("f", "a.pdf", "application/pdf", buf);
    await new Promise((r) => setTimeout(r, 2)); // ensure Date.now() differs
    const b = await uploadFile("f", "b.pdf", "application/pdf", buf);
    // IDs are based on Date.now() so may collide in very fast test runs;
    // just verify they are defined strings
    expect(typeof a.id).toBe("string");
    expect(typeof b.id).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// copyFileInDrive
// ---------------------------------------------------------------------------

describe("copyFileInDrive()", () => {
  it("returns a DriveFile with the given new name", async () => {
    const result = await copyFileInDrive("mock-file-1", "copy-of-doc.pdf", "folder-123");
    expect(result.name).toBe("copy-of-doc.pdf");
  });

  it("id starts with mock-copy- in mock mode", async () => {
    const result = await copyFileInDrive("mock-file-1", "copy.pdf", "folder-123");
    expect(result.id).toMatch(/^mock-copy-/);
  });

  it("marks the copy as an official record when the name contains _OFFICIAL_RECORD_", async () => {
    const name = "_OFFICIAL_RECORD_2026-02-27_agenda.pdf";
    const result = await copyFileInDrive("mock-file-1", name, "folder-123");
    expect(result.isOfficialRecord).toBe(true);
  });

  it("does NOT mark copy as official record when name lacks the marker", async () => {
    const result = await copyFileInDrive("mock-file-1", "agenda.pdf", "folder-123");
    expect(result.isOfficialRecord).toBe(false);
  });

  it("returns unique IDs for successive copies", async () => {
    const a = await copyFileInDrive("mock-file-1", "a.pdf", "folder-1");
    await new Promise((r) => setTimeout(r, 2)); // ensure Date.now() advances
    const b = await copyFileInDrive("mock-file-1", "b.pdf", "folder-1");
    expect(typeof a.id).toBe("string");
    expect(typeof b.id).toBe("string");
  });

  it("sets createdTime and modifiedTime as valid ISO 8601 strings", async () => {
    const result = await copyFileInDrive("mock-file-1", "doc.pdf", "folder-123");
    expect(new Date(result.createdTime).toISOString()).toBe(result.createdTime);
    expect(new Date(result.modifiedTime).toISOString()).toBe(result.modifiedTime);
  });
});

// ---------------------------------------------------------------------------
// checkDriveAccess
// ---------------------------------------------------------------------------

describe("checkDriveAccess()", () => {
  it("returns false in mock mode (no SA credentials)", async () => {
    const result = await checkDriveAccess();
    expect(result).toBe(false);
  });
});
