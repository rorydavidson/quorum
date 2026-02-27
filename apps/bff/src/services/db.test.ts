/**
 * db.test.ts — unit tests for the DB service layer
 *
 * Uses a real in-memory SQLite database (DATABASE_URL=':memory:' set by test-setup.ts).
 * All tests share the same Knex instance (module singleton) which connects to the
 * same :memory: DB, so we run migrations once and wipe rows between tests.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import db, {
  deleteSection,
  deleteSpace,
  getSectionById,
  getSpaceById,
  getSpaces,
  getSpacesByGroups,
  runMigrations,
  upsertSection,
  upsertSpace,
} from "./db.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_SPACE = {
  name: "Board",
  description: undefined as string | undefined,
  keycloakGroup: "/board-members",
  driveFolderId: "folder-board-001",
  calendarId: undefined as string | undefined,
  icalUrl: undefined as string | undefined,
  hierarchyCategory: "Board Level",
  uploadGroups: ["secretariat"] as string[],
  sortOrder: 1,
};

const BASE_SECTION = {
  name: "Agendas",
  description: undefined as string | undefined,
  driveFolderId: "folder-agendas-001",
  sortOrder: 0,
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Migrations are idempotent; run once to create tables.
  await runMigrations();
});

beforeEach(async () => {
  // Wipe data between tests. Delete sections first to avoid FK issues.
  await db("space_sections").delete();
  await db("spaces").delete();
});

// ---------------------------------------------------------------------------
// runMigrations
// ---------------------------------------------------------------------------

describe("runMigrations()", () => {
  it("creates the spaces table", async () => {
    const has = await db.schema.hasTable("spaces");
    expect(has).toBe(true);
  });

  it("creates the space_sections table", async () => {
    const has = await db.schema.hasTable("space_sections");
    expect(has).toBe(true);
  });

  it("is idempotent — calling a second time does not throw", async () => {
    await expect(runMigrations()).resolves.toBeUndefined();
  });

  it("creates the ical_url column on spaces", async () => {
    const has = await db.schema.hasColumn("spaces", "ical_url");
    expect(has).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// upsertSpace
// ---------------------------------------------------------------------------

describe("upsertSpace()", () => {
  it("inserts a new space and returns a correctly-mapped SpaceConfig", async () => {
    const space = await upsertSpace("space-1", BASE_SPACE);

    expect(space.id).toBe("space-1");
    expect(space.name).toBe("Board");
    expect(space.keycloakGroup).toBe("/board-members");
    expect(space.driveFolderId).toBe("folder-board-001");
    expect(space.hierarchyCategory).toBe("Board Level");
    expect(space.uploadGroups).toEqual(["secretariat"]);
    expect(space.sortOrder).toBe(1);
    expect(space.sections).toEqual([]); // upsert never fetches sections
  });

  it("updates an existing space in place", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    const updated = await upsertSpace("space-1", { ...BASE_SPACE, name: "Board (Renamed)" });

    expect(updated.name).toBe("Board (Renamed)");

    // Confirm only one row was written
    const all = await getSpaces();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Board (Renamed)");
  });

  it("persists optional description", async () => {
    const space = await upsertSpace("space-1", { ...BASE_SPACE, description: "Main board area" });
    expect(space.description).toBe("Main board area");
  });

  it("persists calendarId and icalUrl", async () => {
    await upsertSpace("space-1", {
      ...BASE_SPACE,
      calendarId: "cal-abc@group.calendar.google.com",
      icalUrl: "https://example.com/feed.ics",
    });

    // Verify via a full fetch from DB
    const fetched = await getSpaceById("space-1");
    expect(fetched?.calendarId).toBe("cal-abc@group.calendar.google.com");
    expect(fetched?.icalUrl).toBe("https://example.com/feed.ics");
  });

  it("persists uploadGroups as a JSON array with multiple entries", async () => {
    await upsertSpace("space-1", {
      ...BASE_SPACE,
      uploadGroups: ["secretariat", "board-admin", "tc-chair"],
    });

    const fetched = await getSpaceById("space-1");
    expect(fetched?.uploadGroups).toEqual(["secretariat", "board-admin", "tc-chair"]);
  });

  it("persists an empty uploadGroups array", async () => {
    await upsertSpace("space-1", { ...BASE_SPACE, uploadGroups: [] });
    const fetched = await getSpaceById("space-1");
    expect(fetched?.uploadGroups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getSpaceById
// ---------------------------------------------------------------------------

describe("getSpaceById()", () => {
  it("returns undefined for a non-existent ID", async () => {
    const result = await getSpaceById("does-not-exist");
    expect(result).toBeUndefined();
  });

  it("returns the space when it exists", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    const space = await getSpaceById("space-1");

    expect(space).toBeDefined();
    expect(space!.id).toBe("space-1");
    expect(space!.name).toBe("Board");
  });

  it("returns the space with its sections attached", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    await upsertSection("space-1", "sec-1", { ...BASE_SECTION, name: "Agendas", sortOrder: 0 });
    await upsertSection("space-1", "sec-2", { ...BASE_SECTION, name: "Minutes", sortOrder: 1 });

    const space = await getSpaceById("space-1");
    expect(space!.sections).toHaveLength(2);
    expect(space!.sections[0].id).toBe("sec-1");
    expect(space!.sections[0].name).toBe("Agendas");
    expect(space!.sections[1].id).toBe("sec-2");
  });

  it("returns an empty sections array when the space has no sections", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    const space = await getSpaceById("space-1");
    expect(space!.sections).toEqual([]);
  });

  it("maps optional null DB columns to undefined in the domain type", async () => {
    await upsertSpace("space-1", {
      ...BASE_SPACE,
      description: undefined,
      calendarId: undefined,
      icalUrl: undefined,
    });
    const space = await getSpaceById("space-1");
    expect(space!.description).toBeUndefined();
    expect(space!.calendarId).toBeUndefined();
    expect(space!.icalUrl).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getSpaces
// ---------------------------------------------------------------------------

describe("getSpaces()", () => {
  it("returns an empty array when no spaces exist", async () => {
    const spaces = await getSpaces();
    expect(spaces).toHaveLength(0);
  });

  it("returns all spaces ordered by sort_order ascending", async () => {
    await upsertSpace("space-c", { ...BASE_SPACE, name: "C", sortOrder: 3 });
    await upsertSpace("space-a", { ...BASE_SPACE, name: "A", sortOrder: 1 });
    await upsertSpace("space-b", { ...BASE_SPACE, name: "B", sortOrder: 2 });

    const spaces = await getSpaces();
    expect(spaces.map((s) => s.id)).toEqual(["space-a", "space-b", "space-c"]);
  });

  it("attaches sections to their parent spaces", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    await upsertSection("space-1", "sec-1", { ...BASE_SECTION, sortOrder: 0 });
    await upsertSection("space-1", "sec-2", { ...BASE_SECTION, name: "Minutes", sortOrder: 1 });

    const [space] = await getSpaces();
    expect(space.sections).toHaveLength(2);
    expect(space.sections[0].sortOrder).toBe(0);
    expect(space.sections[1].sortOrder).toBe(1);
  });

  it("does not mix sections between different spaces", async () => {
    await upsertSpace("space-1", { ...BASE_SPACE, name: "Space 1", keycloakGroup: "/g1", sortOrder: 1 });
    await upsertSpace("space-2", { ...BASE_SPACE, name: "Space 2", keycloakGroup: "/g2", sortOrder: 2 });
    await upsertSection("space-1", "sec-1", BASE_SECTION);
    await upsertSection("space-2", "sec-2", { ...BASE_SECTION, name: "Minutes" });

    const spaces = await getSpaces();
    expect(spaces[0].sections).toHaveLength(1);
    expect(spaces[0].sections[0].id).toBe("sec-1");
    expect(spaces[1].sections).toHaveLength(1);
    expect(spaces[1].sections[0].id).toBe("sec-2");
  });
});

// ---------------------------------------------------------------------------
// getSpacesByGroups
// ---------------------------------------------------------------------------

describe("getSpacesByGroups()", () => {
  it("returns an empty array immediately for an empty groups input", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    const result = await getSpacesByGroups([]);
    expect(result).toHaveLength(0);
  });

  it("filters spaces by a single keycloak group", async () => {
    await upsertSpace("board", { ...BASE_SPACE, keycloakGroup: "/board-members", name: "Board", sortOrder: 1 });
    await upsertSpace("tech", { ...BASE_SPACE, keycloakGroup: "/technical-committee", name: "TC", sortOrder: 2 });

    const result = await getSpacesByGroups(["/board-members"]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("board");
  });

  it("returns spaces matching any of multiple groups", async () => {
    await upsertSpace("board", { ...BASE_SPACE, keycloakGroup: "/board-members", name: "Board", sortOrder: 1 });
    await upsertSpace("tech", { ...BASE_SPACE, keycloakGroup: "/technical-committee", name: "TC", sortOrder: 2 });
    await upsertSpace("exec", { ...BASE_SPACE, keycloakGroup: "/executive", name: "Exec", sortOrder: 3 });

    const result = await getSpacesByGroups(["/board-members", "/technical-committee"]);
    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id);
    expect(ids).toContain("board");
    expect(ids).toContain("tech");
  });

  it("returns an empty array when no spaces match the given groups", async () => {
    await upsertSpace("board", { ...BASE_SPACE, keycloakGroup: "/board-members" });
    const result = await getSpacesByGroups(["/nonexistent-group"]);
    expect(result).toHaveLength(0);
  });

  it("attaches sections to filtered spaces", async () => {
    await upsertSpace("board", { ...BASE_SPACE, keycloakGroup: "/board-members" });
    await upsertSection("board", "sec-1", BASE_SECTION);

    const result = await getSpacesByGroups(["/board-members"]);
    expect(result[0].sections).toHaveLength(1);
    expect(result[0].sections[0].id).toBe("sec-1");
  });
});

// ---------------------------------------------------------------------------
// deleteSpace
// ---------------------------------------------------------------------------

describe("deleteSpace()", () => {
  it("removes the space so it is no longer retrievable", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    await deleteSpace("space-1");

    const result = await getSpaceById("space-1");
    expect(result).toBeUndefined();
  });

  it("removes the space from the full list", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    await upsertSpace("space-2", { ...BASE_SPACE, keycloakGroup: "/other", sortOrder: 2 });

    await deleteSpace("space-1");

    const spaces = await getSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0].id).toBe("space-2");
  });

  it("resolves without error when the space does not exist", async () => {
    await expect(deleteSpace("does-not-exist")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// upsertSection
// ---------------------------------------------------------------------------

describe("upsertSection()", () => {
  it("creates a new section and returns a correctly-mapped SpaceSection", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    const section = await upsertSection("space-1", "sec-1", BASE_SECTION);

    expect(section.id).toBe("sec-1");
    expect(section.name).toBe("Agendas");
    expect(section.driveFolderId).toBe("folder-agendas-001");
    expect(section.sortOrder).toBe(0);
    expect(section.description).toBeUndefined();
  });

  it("updates an existing section in place", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    await upsertSection("space-1", "sec-1", BASE_SECTION);
    const updated = await upsertSection("space-1", "sec-1", {
      ...BASE_SECTION,
      name: "Agendas (Updated)",
      driveFolderId: "folder-new-xyz",
    });

    expect(updated.name).toBe("Agendas (Updated)");
    expect(updated.driveFolderId).toBe("folder-new-xyz");

    // Confirm only one section exists for the space
    const space = await getSpaceById("space-1");
    expect(space!.sections).toHaveLength(1);
  });

  it("persists an optional description", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    await upsertSection("space-1", "sec-1", { ...BASE_SECTION, description: "Meeting agendas archive" });

    const section = await getSectionById("space-1", "sec-1");
    expect(section!.description).toBe("Meeting agendas archive");
  });
});

// ---------------------------------------------------------------------------
// getSectionById
// ---------------------------------------------------------------------------

describe("getSectionById()", () => {
  it("returns undefined for a non-existent section", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    const result = await getSectionById("space-1", "nonexistent-sec");
    expect(result).toBeUndefined();
  });

  it("returns the section when it exists", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    await upsertSection("space-1", "sec-1", BASE_SECTION);

    const section = await getSectionById("space-1", "sec-1");
    expect(section).toBeDefined();
    expect(section!.id).toBe("sec-1");
    expect(section!.name).toBe("Agendas");
  });

  it("scopes the lookup to the correct spaceId", async () => {
    await upsertSpace("space-1", { ...BASE_SPACE, keycloakGroup: "/g1", sortOrder: 1 });
    await upsertSpace("space-2", { ...BASE_SPACE, keycloakGroup: "/g2", sortOrder: 2 });
    await upsertSection("space-1", "sec-1", BASE_SECTION);

    // Same sectionId but looked up under the wrong space → undefined
    const result = await getSectionById("space-2", "sec-1");
    expect(result).toBeUndefined();
  });

  it("maps null description to undefined", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    await upsertSection("space-1", "sec-1", { ...BASE_SECTION, description: undefined });

    const section = await getSectionById("space-1", "sec-1");
    expect(section!.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteSection
// ---------------------------------------------------------------------------

describe("deleteSection()", () => {
  it("removes the specified section", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    await upsertSection("space-1", "sec-1", BASE_SECTION);

    await deleteSection("space-1", "sec-1");

    expect(await getSectionById("space-1", "sec-1")).toBeUndefined();
  });

  it("does not remove sibling sections", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    await upsertSection("space-1", "sec-1", { ...BASE_SECTION, name: "Agendas" });
    await upsertSection("space-1", "sec-2", { ...BASE_SECTION, name: "Minutes" });

    await deleteSection("space-1", "sec-1");

    expect(await getSectionById("space-1", "sec-1")).toBeUndefined();
    expect(await getSectionById("space-1", "sec-2")).toBeDefined();
  });

  it("resolves without error when the section does not exist", async () => {
    await upsertSpace("space-1", BASE_SPACE);
    await expect(deleteSection("space-1", "nonexistent")).resolves.toBeUndefined();
  });

  it("scopes deletion to the correct spaceId", async () => {
    await upsertSpace("space-1", { ...BASE_SPACE, keycloakGroup: "/g1", sortOrder: 1 });
    await upsertSpace("space-2", { ...BASE_SPACE, keycloakGroup: "/g2", sortOrder: 2 });
    await upsertSection("space-1", "sec-1", BASE_SECTION);

    // Attempt to delete sec-1 but under the wrong space — should no-op
    await deleteSection("space-2", "sec-1");

    // sec-1 under space-1 should still exist
    expect(await getSectionById("space-1", "sec-1")).toBeDefined();
  });
});
