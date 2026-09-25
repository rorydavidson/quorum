/**
 * db.test.ts — unit tests for the DB service layer
 *
 * Uses a real in-memory SQLite database (DATABASE_URL=':memory:' set by test-setup.ts).
 * All tests share the same Knex instance (module singleton) which connects to the
 * same :memory: DB, so we run migrations once and wipe rows between tests.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import db, {
  createActivity,
  createAuditLog,
  deleteSection,
  deleteSpace,
  getAllSubscriptions,
  getAuditLogs,
  getEventMetadata,
  getSectionById,
  getSpaceById,
  getSpaces,
  getSpaceSubscribers,
  getSpacesByGroups,
  getUserSubscriptions,
  isSweepBootstrapped,
  markDriveFileSeen,
  markSweepBootstrapped,
  restoreBackup,
  runMigrations,
  subscribeToSpace,
  unsubscribeFromSpace,
  upsertEventMetadata,
  upsertSection,
  upsertSpace,
} from "./db.js";
import { EventSpaceMismatchError } from "./errors.js";

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
  // Wipe data between tests. Delete children first to avoid FK issues.
  await db("event_metadata").delete();
  await db("space_sections").delete();
  await db("spaces").delete();
  await db("drive_seen_files").delete();
  await db("drive_sweep_state").delete();
  await db("notification_subscriptions").delete();
  await db("activities").delete();
  await db("audit_logs").delete();
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

// ---------------------------------------------------------------------------
// Event metadata — must be scoped to the space the caller was authorised for
// ---------------------------------------------------------------------------

describe("getEventMetadata() / upsertEventMetadata()", () => {
  beforeEach(async () => {
    await upsertSpace("board", BASE_SPACE);
    await upsertSpace("finance", { ...BASE_SPACE, name: "Finance", keycloakGroup: "/finance" });
  });

  it("creates metadata under the given space", async () => {
    const created = await upsertEventMetadata("evt-1", "board", {
      googleDocUrl: "https://docs.google.com/document/d/abc",
    });
    expect(created).toEqual({
      id: "evt-1",
      spaceId: "board",
      googleDocUrl: "https://docs.google.com/document/d/abc",
      agendaItems: [],
    });
  });

  it("does not return another space's metadata for the same event id", async () => {
    await upsertEventMetadata("evt-1", "board", { agendaItems: [] });

    expect(await getEventMetadata("evt-1", "board")).toBeDefined();
    expect(await getEventMetadata("evt-1", "finance")).toBeUndefined();
  });

  it("refuses to overwrite metadata that belongs to another space", async () => {
    await upsertEventMetadata("evt-1", "board", {
      googleDocUrl: "https://docs.google.com/document/d/original",
    });

    await expect(
      upsertEventMetadata("evt-1", "finance", {
        googleDocUrl: "https://evil.example/hijacked",
      }),
    ).rejects.toBeInstanceOf(EventSpaceMismatchError);

    const untouched = await getEventMetadata("evt-1", "board");
    expect(untouched?.googleDocUrl).toBe("https://docs.google.com/document/d/original");
    expect(untouched?.spaceId).toBe("board");
  });

  it("updates in place when the space matches", async () => {
    await upsertEventMetadata("evt-1", "board", { agendaItems: [] });
    const updated = await upsertEventMetadata("evt-1", "board", {
      agendaItems: [{ id: "a1", text: "Approve minutes", completed: false }],
    });

    expect(updated.agendaItems).toHaveLength(1);
    const rows = await db("event_metadata").where({ id: "evt-1" });
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// restoreBackup — defensive handling of older backup shapes
// ---------------------------------------------------------------------------

describe("restoreBackup()", () => {
  it("stores an empty uploadGroups array when the backup omits the field", async () => {
    await restoreBackup({
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      spaces: [
        {
          id: "board",
          name: "Board",
          keycloakGroup: "/board-members",
          driveFolderId: "folder-1",
          hierarchyCategory: "Board Level",
          // Simulates a backup written before uploadGroups existed.
          uploadGroups: undefined as unknown as string[],
          sortOrder: 0,
          sections: [],
        },
      ],
      eventMetadata: [],
    });

    // Previously JSON.stringify(undefined) stored the string "undefined",
    // which made every subsequent getSpaces() throw on JSON.parse.
    const spaces = await getSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0].uploadGroups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The functions below use RETURNING / ON CONFLICT / timestamps, which behave
// differently on SQLite and PostgreSQL. CI runs this file against both.
// ---------------------------------------------------------------------------

describe("drive sweep state", () => {
  it("markDriveFileSeen() reports true only for the first sighting", async () => {
    expect(await markDriveFileSeen("board", "f1")).toBe(true);
    expect(await markDriveFileSeen("board", "f1")).toBe(false);
    // Same file id in another space is a separate sighting.
    expect(await markDriveFileSeen("finance", "f1")).toBe(true);
  });

  it("markSweepBootstrapped() is idempotent and visible via isSweepBootstrapped()", async () => {
    expect(await isSweepBootstrapped("board")).toBe(false);
    await markSweepBootstrapped("board");
    await markSweepBootstrapped("board");
    expect(await isSweepBootstrapped("board")).toBe(true);
    expect(await isSweepBootstrapped("finance")).toBe(false);
  });
});

describe("notification subscriptions", () => {
  it("subscribe / list / unsubscribe round-trips", async () => {
    await subscribeToSpace("u1", "board", "u1@example.com");
    await subscribeToSpace("u2", "board", "u2@example.com");

    const subs = await getSpaceSubscribers("board");
    expect(subs.map((s) => s.email).sort()).toEqual(["u1@example.com", "u2@example.com"]);

    await unsubscribeFromSpace("u1", "board");
    expect((await getSpaceSubscribers("board")).map((s) => s.userId)).toEqual(["u2"]);
  });

  it("re-subscribing refreshes the stored email without duplicating the row", async () => {
    await subscribeToSpace("u1", "board", "old@example.com");
    await subscribeToSpace("u1", "board", "new@example.com");

    const subs = await getSpaceSubscribers("board");
    expect(subs).toEqual([{ userId: "u1", email: "new@example.com" }]);
  });

  it("getAllSubscriptions() returns createdAt as a parseable string", async () => {
    await subscribeToSpace("u1", "board", "u1@example.com");
    const [sub] = await getAllSubscriptions();

    expect(sub).toMatchObject({ userId: "u1", spaceId: "board", email: "u1@example.com" });
    expect(typeof sub.createdAt).toBe("string");
    expect(Number.isNaN(new Date(sub.createdAt.replace(" ", "T")).getTime())).toBe(false);
  });

  it("getUserSubscriptions() lists only the given user's spaces", async () => {
    await subscribeToSpace("u1", "board", "u1@example.com");
    await subscribeToSpace("u1", "finance", "u1@example.com");
    await subscribeToSpace("u2", "board", "u2@example.com");

    const mine = await getUserSubscriptions("u1");
    expect(mine.map((s) => s.spaceId).sort()).toEqual(["board", "finance"]);
  });
});

describe("createActivity()", () => {
  it("returns the generated id and a created timestamp", async () => {
    const activity = await createActivity({
      spaceId: "board",
      type: "NEW_DOCUMENT",
      title: "Minutes.pdf",
      link: "/spaces/board/documents",
      entityId: "f1",
      actorName: "Rory",
    });

    expect(typeof activity.id).toBe("number");
    expect(activity.id).toBeGreaterThan(0);
    expect(activity).toMatchObject({
      spaceId: "board",
      type: "NEW_DOCUMENT",
      title: "Minutes.pdf",
      entityId: "f1",
      actorName: "Rory",
    });
    expect(activity.createdAt).toBeTruthy();

    const rows = await db("activities");
    expect(rows).toHaveLength(1);
  });
});

describe("audit logs", () => {
  const base = { userId: "u1", userName: "Rory", entityType: "SPACE", entityId: "board" };

  it("stores entries and filters by action", async () => {
    await createAuditLog({ ...base, action: "CREATE_SPACE" });
    await createAuditLog({ ...base, action: "DELETE_SPACE", details: JSON.stringify({ id: "board" }) });

    const all = await getAuditLogs();
    expect(all).toHaveLength(2);
    // SQLite returns a string, pg a Date; either way the row carries a timestamp.
    all.forEach((l) => expect(l.timestamp).toBeTruthy());

    const deletes = await getAuditLogs({ action: "DELETE_SPACE" });
    expect(deletes).toHaveLength(1);
    expect(deletes[0].details).toBe(JSON.stringify({ id: "board" }));
  });

  it("filters by a case-insensitive user name fragment and honours limit/offset", async () => {
    await createAuditLog({ ...base, action: "CREATE_SPACE", userName: "Rory Davidson" });
    await createAuditLog({ ...base, action: "CREATE_SPACE", userName: "Someone Else" });
    await createAuditLog({ ...base, action: "CREATE_SPACE", userName: "rory again" });

    expect(await getAuditLogs({ user: "RORY" })).toHaveLength(2);
    expect(await getAuditLogs({ limit: 2 })).toHaveLength(2);
    expect(await getAuditLogs({ limit: 2, offset: 2 })).toHaveLength(1);
  });
});
