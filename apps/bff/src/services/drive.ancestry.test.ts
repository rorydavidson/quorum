/**
 * drive.ancestry.test.ts — folder/file ancestry verification against a fake
 * Drive tree.
 *
 * These checks are the server-side guard against IDOR: a caller supplies a
 * folderId or fileId and the route must refuse anything outside the space's
 * Drive folder. drive.test.ts runs in mock mode where these always return
 * true, so this file sets Service Account env vars and mocks googleapis.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const filesGet = vi.hoisted(() => vi.fn());

vi.mock("googleapis", () => ({
  google: {
    auth: {
      JWT: class {
        constructor(_opts: unknown) {}
      },
    },
    drive: () => ({ files: { get: filesGet } }),
  },
}));

import { clearDriveCaches, verifyFileAncestry, verifyFolderAncestry } from "./drive.js";

// Fake Drive tree.
//
//   root ─ a ─ b ─ c ─ file-in-c
//   other-root ─ x ─ file-in-x
//   orphan (no parents)
//
const PARENTS: Record<string, string[]> = {
  root: [],
  "other-root": [],
  a: ["root"],
  b: ["a"],
  c: ["b"],
  "file-in-c": ["c"],
  x: ["other-root"],
  "file-in-x": ["x"],
  orphan: [],
};

beforeEach(() => {
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "sa@example.iam.gserviceaccount.com");
  vi.stubEnv("GOOGLE_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\\nnot-a-real-key\\n-----END PRIVATE KEY-----");
  clearDriveCaches();
  filesGet.mockReset();
  filesGet.mockImplementation(async ({ fileId }: { fileId: string }) => {
    if (!(fileId in PARENTS)) {
      throw new Error(`File not found: ${fileId}`);
    }
    return { data: { parents: PARENTS[fileId] } };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyFolderAncestry()", () => {
  it("accepts the root folder itself without calling Drive", async () => {
    expect(await verifyFolderAncestry("root", "root")).toBe(true);
    expect(filesGet).not.toHaveBeenCalled();
  });

  it("accepts a direct child of the root", async () => {
    expect(await verifyFolderAncestry("a", "root")).toBe(true);
  });

  it("walks the parent chain for a deeply nested folder", async () => {
    expect(await verifyFolderAncestry("c", "root")).toBe(true);
    // c → b → a → root: three lookups, one per hop below the root
    expect(filesGet).toHaveBeenCalledTimes(3);
  });

  it("rejects a folder that lives under a different root", async () => {
    expect(await verifyFolderAncestry("x", "root")).toBe(false);
  });

  it("rejects a folder whose chain ends without reaching the root", async () => {
    expect(await verifyFolderAncestry("orphan", "root")).toBe(false);
  });

  it("rejects the root's own ancestors (walking up never counts as inside)", async () => {
    // Asking whether "root" is inside "a" must be false: root has no parents.
    expect(await verifyFolderAncestry("root", "a")).toBe(false);
  });

  it("gives up after the depth cap instead of walking forever", async () => {
    // Build a 40-deep chain that never reaches "root".
    const deep: Record<string, string[]> = {};
    for (let i = 0; i < 40; i++) deep[`d${i}`] = [`d${i + 1}`];
    filesGet.mockImplementation(async ({ fileId }: { fileId: string }) => ({
      data: { parents: deep[fileId] ?? [`d${fileId}-next`] },
    }));

    expect(await verifyFolderAncestry("d0", "root")).toBe(false);
    expect(filesGet.mock.calls.length).toBeLessThanOrEqual(15);
  });

  it("propagates a Drive error rather than answering true", async () => {
    await expect(verifyFolderAncestry("does-not-exist", "root")).rejects.toThrow(/File not found/);
  });

  it("caches a verdict so the second check makes no Drive calls", async () => {
    await verifyFolderAncestry("c", "root");
    filesGet.mockClear();

    expect(await verifyFolderAncestry("c", "root")).toBe(true);
    expect(filesGet).not.toHaveBeenCalled();
  });

  it("reuses cached parent links across different queries", async () => {
    await verifyFolderAncestry("c", "root"); // learns c→b, b→a, a→root
    filesGet.mockClear();

    // "b" under "root" needs b→a→root, both already cached.
    expect(await verifyFolderAncestry("b", "root")).toBe(true);
    expect(filesGet).not.toHaveBeenCalled();
  });
});

describe("verifyFileAncestry()", () => {
  it("accepts a file inside a nested folder of the root", async () => {
    expect(await verifyFileAncestry("file-in-c", "root")).toBe(true);
  });

  it("accepts a file placed directly in the root", async () => {
    filesGet.mockImplementationOnce(async () => ({ data: { parents: ["root"] } }));
    expect(await verifyFileAncestry("file-in-root", "root")).toBe(true);
  });

  it("rejects a file that belongs to another space's tree", async () => {
    expect(await verifyFileAncestry("file-in-x", "root")).toBe(false);
  });

  it("rejects a file with no parents at all", async () => {
    expect(await verifyFileAncestry("orphan", "root")).toBe(false);
  });

  it("propagates a Drive error rather than answering true", async () => {
    await expect(verifyFileAncestry("ghost-file", "root")).rejects.toThrow(/File not found/);
  });
});
