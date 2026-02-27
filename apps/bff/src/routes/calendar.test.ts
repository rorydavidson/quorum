/**
 * calendar.test.ts — integration tests for GET /calendar
 *
 * Both the db service and calendar service are mocked so no real DB
 * or HTTP calls happen.
 */

import express from "express";
import session from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { SessionUser } from "@snomed/types";
import type { SpaceConfig, CalendarEvent } from "@snomed/types";

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

vi.mock("../services/calendar.js", () => ({
  getUpcomingEvents: vi.fn(),
  listEvents: vi.fn(),
}));

import * as db from "../services/db.js";
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
  calendarId: "tc@group.calendar.google.com",
  hierarchyCategory: "Working Groups",
  uploadGroups: [],
  sortOrder: 2,
  sections: [],
};

const NO_CAL_SPACE: SpaceConfig = {
  id: "nocal",
  name: "No Calendar Space",
  keycloakGroup: "/no-cal",
  driveFolderId: "folder-nocal",
  hierarchyCategory: "Other",
  uploadGroups: [],
  sortOrder: 3,
  sections: [],
};

const MOCK_EVENTS: CalendarEvent[] = [
  {
    id: "evt-1",
    summary: "Board Q1 Meeting",
    start: "2026-03-10T09:00:00Z",
    end: "2026-03-10T12:00:00Z",
    spaceId: "board",
    spaceName: "Board",
  },
];

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
  const { default: calendarRouter } = await import("./calendar.js");
  app.use("/calendar", calendarRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /calendar — auth", () => {
  it("returns 401 when no session user", async () => {
    const app = await createApp();
    const res = await request(app).get("/calendar");
    expect(res.status).toBe(401);
  });
});

describe("GET /calendar — success paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calendarService.getUpcomingEvents).mockResolvedValue(MOCK_EVENTS);
    vi.mocked(db.getSpaces).mockResolvedValue([
      BOARD_SPACE,
      TC_SPACE,
      NO_CAL_SPACE,
    ]);
  });

  it("admin gets events from ALL spaces (including those the admin doesn't belong to)", async () => {
    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/calendar");

    expect(res.status).toBe(200);
    // getUpcomingEvents should be called with entries from BOARD and TC (both have calendarId),
    // but NOT from NO_CAL_SPACE (no calendarId or icalUrl).
    expect(vi.mocked(calendarService.getUpcomingEvents)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          calendarId: "board@group.calendar.google.com",
        }),
        expect.objectContaining({ calendarId: "tc@group.calendar.google.com" }),
      ]),
      expect.any(Number),
      expect.any(Number),
    );
    // NO_CAL_SPACE should not be in the call
    const callArgs = vi.mocked(calendarService.getUpcomingEvents).mock
      .calls[0][0];
    expect(callArgs.some((e) => e.calendarId === "")).toBe(false);
  });

  it("non-admin only gets events from accessible spaces", async () => {
    // User is only in /board-members, not /technical-committee
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).get("/calendar");

    expect(res.status).toBe(200);
    const callArgs = vi.mocked(calendarService.getUpcomingEvents).mock
      .calls[0][0];
    expect(callArgs).toHaveLength(1);
    expect(callArgs[0].calendarId).toBe("board@group.calendar.google.com");
  });

  it("excludes spaces with no calendarId or icalUrl", async () => {
    const app = await createApp(makeUser(["portal_admin"]));
    await request(app).get("/calendar");

    const callArgs = vi.mocked(calendarService.getUpcomingEvents).mock
      .calls[0][0];
    const ids = callArgs.map((e) => e.calendarId);
    expect(ids).not.toContain(undefined);
    // nocal space should not be included
    expect(callArgs.find((e) => e.spaceId === "nocal")).toBeUndefined();
  });

  it("filters by ?spaceId when provided", async () => {
    const app = await createApp(makeUser(["portal_admin"]));
    await request(app).get("/calendar?spaceId=board");

    const callArgs = vi.mocked(calendarService.getUpcomingEvents).mock
      .calls[0][0];
    expect(callArgs).toHaveLength(1);
    expect(callArgs[0].spaceId).toBe("board");
  });

  it("clamps ?limit to max 50 and min 1", async () => {
    const app = await createApp(makeUser(["portal_admin"]));

    await request(app).get("/calendar?limit=999");
    const highCall = vi.mocked(calendarService.getUpcomingEvents).mock.calls[0];
    expect(highCall[1]).toBe(50); // clamped to max

    vi.mocked(calendarService.getUpcomingEvents).mockClear();

    // Note: ?limit=0 falls through to the default (parseInt('0') || 10 = 10).
    // Use a negative value to test the Math.max(x, 1) clamp:
    // parseInt('-1') = -1, which is truthy so || 10 doesn't apply → Math.max(-1, 1) = 1.
    await request(app).get("/calendar?limit=-1");
    const lowCall = vi.mocked(calendarService.getUpcomingEvents).mock.calls[0];
    expect(lowCall[1]).toBe(1); // clamped to min
  });

  it("clamps ?days to max 365 and min 1", async () => {
    const app = await createApp(makeUser(["portal_admin"]));

    await request(app).get("/calendar?days=9999");
    const highCall = vi.mocked(calendarService.getUpcomingEvents).mock.calls[0];
    expect(highCall[2]).toBe(365);

    vi.mocked(calendarService.getUpcomingEvents).mockClear();

    await request(app).get("/calendar?days=-5");
    const lowCall = vi.mocked(calendarService.getUpcomingEvents).mock.calls[0];
    expect(lowCall[2]).toBe(1);
  });

  it("returns the events array from getUpcomingEvents", async () => {
    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/calendar");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe("evt-1");
  });

  it("includes spaceId and spaceName in the calendar entry passed to getUpcomingEvents", async () => {
    const app = await createApp(makeUser(["portal_admin"]));
    await request(app).get("/calendar");

    const callArgs = vi.mocked(calendarService.getUpcomingEvents).mock
      .calls[0][0];
    const boardEntry = callArgs.find((e) => e.spaceId === "board");
    expect(boardEntry?.spaceName).toBe("Board");
  });
});

describe("GET /calendar — icalUrl-only spaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes spaces that have icalUrl but no calendarId", async () => {
    const icalOnlySpace: SpaceConfig = {
      ...NO_CAL_SPACE,
      id: "ical-only",
      icalUrl: "https://example.com/feed.ics",
    };
    vi.mocked(db.getSpaces).mockResolvedValue([icalOnlySpace]);
    vi.mocked(calendarService.getUpcomingEvents).mockResolvedValue([]);

    const app = await createApp(makeUser(["portal_admin"]));
    await request(app).get("/calendar");

    const callArgs = vi.mocked(calendarService.getUpcomingEvents).mock
      .calls[0][0];
    expect(callArgs).toHaveLength(1);
    expect(callArgs[0].icalUrl).toBe("https://example.com/feed.ics");
  });
});

describe("GET /calendar — error handling", () => {
  it("returns 502 when getUpcomingEvents throws", async () => {
    vi.mocked(db.getSpaces).mockResolvedValue([BOARD_SPACE]);
    vi.mocked(calendarService.getUpcomingEvents).mockRejectedValueOnce(
      new Error("Calendar API unavailable"),
    );

    const app = await createApp(makeUser(["portal_admin"]));
    const res = await request(app).get("/calendar");

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("CALENDAR_ERROR");
  });
});
