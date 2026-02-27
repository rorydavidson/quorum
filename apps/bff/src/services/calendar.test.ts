/**
 * calendar.test.ts — unit tests for the calendar service
 *
 * SA credentials are NOT set (test-setup.ts), so the service operates in
 * "Tier 2 / iCal-only" mode. node-ical is mocked to avoid real HTTP calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock node-ical — must be hoisted before the service is imported
// ---------------------------------------------------------------------------

vi.mock("node-ical", () => ({
  default: {
    async: {
      fromURL: vi.fn(),
    },
  },
}));

import nodeIcal from "node-ical";
import type { CalendarEntry } from "./calendar.js";
import { getUpcomingEvents, listEvents } from "./calendar.js";

const mockFromURL = vi.mocked(nodeIcal.async.fromURL);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal node-ical VEVENT record. */
function makeVEvent(overrides: {
  uid?: string;
  summary?: string;
  start?: Date;
  end?: Date;
  location?: string;
  description?: string;
  status?: string;
}) {
  const now = new Date();
  const start = overrides.start ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7d
  const end = overrides.end ?? new Date(start.getTime() + 60 * 60 * 1000); // +1h

  return {
    type: "VEVENT",
    uid: overrides.uid ?? "test-uid-1",
    summary: overrides.summary ?? "Test Meeting",
    start,
    end,
    location: overrides.location,
    description: overrides.description,
    status: overrides.status,
    url: undefined,
  };
}

/** Build a CalendarEntry pointing at a fake iCal URL (SA not used since no creds set). */
function calEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    calendarId: "",
    icalUrl: "https://example.com/feed.ics",
    spaceId: "space-1",
    spaceName: "Board",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listEvents — always [] when no SA creds
// ---------------------------------------------------------------------------

describe("listEvents()", () => {
  it("returns [] when no SA credentials are configured", async () => {
    const result = await listEvents("cal-id-123");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getUpcomingEvents — Tier 2 (iCal) path
// ---------------------------------------------------------------------------

describe("getUpcomingEvents()", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] immediately for an empty calendars array", async () => {
    const result = await getUpcomingEvents([]);
    expect(result).toEqual([]);
    expect(mockFromURL).not.toHaveBeenCalled();
  });

  it("fetches from icalUrl and maps events to CalendarEvent shape", async () => {
    mockFromURL.mockResolvedValueOnce({
      evt1: makeVEvent({ uid: "uid-1", summary: "Board Q1" }),
    } as never);

    const result = await getUpcomingEvents([calEntry()], 10, 30);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("uid-1");
    expect(result[0].summary).toBe("Board Q1");
    expect(result[0].spaceId).toBe("space-1");
    expect(result[0].spaceName).toBe("Board");
    expect(typeof result[0].start).toBe("string");
    expect(typeof result[0].end).toBe("string");
  });

  it("attaches the correct spaceId and spaceName from CalendarEntry", async () => {
    mockFromURL.mockResolvedValueOnce({
      evt1: makeVEvent({}),
    } as never);

    const entry = calEntry({ spaceId: "space-xyz", spaceName: "Technical Committee" });
    const result = await getUpcomingEvents([entry], 10, 30);

    expect(result[0].spaceId).toBe("space-xyz");
    expect(result[0].spaceName).toBe("Technical Committee");
  });

  it("maps optional location and description fields", async () => {
    mockFromURL.mockResolvedValueOnce({
      evt1: makeVEvent({ location: "London", description: "Quarterly review" }),
    } as never);

    const result = await getUpcomingEvents([calEntry()], 10, 30);
    expect(result[0].location).toBe("London");
    expect(result[0].description).toBe("Quarterly review");
  });

  it("excludes CANCELLED events", async () => {
    mockFromURL.mockResolvedValueOnce({
      evt1: makeVEvent({ uid: "ok-1", status: "CONFIRMED" }),
      evt2: makeVEvent({ uid: "cancel-1", status: "CANCELLED" }),
    } as never);

    const result = await getUpcomingEvents([calEntry()], 10, 30);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ok-1");
  });

  it("excludes events outside the time window", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // -10 days
    const pastEnd = new Date(past.getTime() + 60 * 60 * 1000);
    const future = new Date(now.getTime() + 400 * 24 * 60 * 60 * 1000); // +400 days (outside 365d window)
    const futureEnd = new Date(future.getTime() + 60 * 60 * 1000);

    mockFromURL.mockResolvedValueOnce({
      past: makeVEvent({ uid: "past", start: past, end: pastEnd }),
      tooFar: makeVEvent({ uid: "too-far", start: future, end: futureEnd }),
      good: makeVEvent({ uid: "good" }), // +7d — within window
    } as never);

    const result = await getUpcomingEvents([calEntry()], 50, 365);
    const ids = result.map((e) => e.id);
    expect(ids).not.toContain("past");
    expect(ids).not.toContain("too-far");
    expect(ids).toContain("good");
  });

  it("sorts events by start time ascending", async () => {
    const now = new Date();
    const day7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const day3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const day14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    mockFromURL.mockResolvedValueOnce({
      e1: makeVEvent({ uid: "day7", start: day7, end: new Date(day7.getTime() + 3600000) }),
      e2: makeVEvent({ uid: "day3", start: day3, end: new Date(day3.getTime() + 3600000) }),
      e3: makeVEvent({ uid: "day14", start: day14, end: new Date(day14.getTime() + 3600000) }),
    } as never);

    const result = await getUpcomingEvents([calEntry()], 10, 30);
    const ids = result.map((e) => e.id);
    expect(ids).toEqual(["day3", "day7", "day14"]);
  });

  it("respects the limit parameter", async () => {
    const now = new Date();
    const events: Record<string, unknown> = {};
    for (let i = 1; i <= 10; i++) {
      const start = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      events[`e${i}`] = makeVEvent({ uid: `uid-${i}`, start, end: new Date(start.getTime() + 3600000) });
    }

    mockFromURL.mockResolvedValueOnce(events as never);

    const result = await getUpcomingEvents([calEntry()], 3, 30);
    expect(result).toHaveLength(3);
  });

  it("falls back to mock events when all iCal fetches fail", async () => {
    mockFromURL.mockRejectedValueOnce(new Error("network error"));

    const result = await getUpcomingEvents([calEntry()], 10, 30);

    // Mock events contain at least 1 event (the MOCK_RAW_EVENTS fallback)
    expect(result.length).toBeGreaterThan(0);
    // All events should be attached to the supplied calendar entry's space
    result.forEach((e) => expect(e.spaceId).toBe("space-1"));
  });

  it("returns empty array when iCal fetch succeeds but yields 0 events (no fallback)", async () => {
    // If fromURL succeeds (even with 0 events), we trust it over mock data
    mockFromURL.mockResolvedValueOnce({} as never);

    const result = await getUpcomingEvents([calEntry()], 10, 30);
    expect(result).toHaveLength(0);
  });

  it("merges events from multiple calendar entries", async () => {
    const now = new Date();
    const day2 = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const day5 = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    mockFromURL
      .mockResolvedValueOnce({
        e1: makeVEvent({ uid: "space1-evt", start: day2, end: new Date(day2.getTime() + 3600000) }),
      } as never)
      .mockResolvedValueOnce({
        e2: makeVEvent({ uid: "space2-evt", start: day5, end: new Date(day5.getTime() + 3600000) }),
      } as never);

    const entries = [
      calEntry({ spaceId: "s1", spaceName: "Space 1", icalUrl: "https://example.com/1.ics" }),
      calEntry({ spaceId: "s2", spaceName: "Space 2", icalUrl: "https://example.com/2.ics" }),
    ];

    const result = await getUpcomingEvents(entries, 10, 30);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toContain("space1-evt");
    expect(result.map((e) => e.id)).toContain("space2-evt");
  });

  it("uses calendarId (not icalUrl) to derive the iCal URL when no icalUrl", async () => {
    // When icalUrl is absent, service derives a Google public iCal URL from calendarId
    mockFromURL.mockResolvedValueOnce({
      e1: makeVEvent({ uid: "derived-url-evt" }),
    } as never);

    const entry = calEntry({ icalUrl: undefined, calendarId: "board@group.calendar.google.com" });
    const result = await getUpcomingEvents([entry], 10, 30);

    // The fetch should have been called with a Google Calendar iCal URL
    expect(mockFromURL).toHaveBeenCalledWith(
      expect.stringContaining("calendar.google.com/calendar/ical")
    );
    expect(result[0].id).toBe("derived-url-evt");
  });

  it("non-VEVENT components (VTIMEZONE, VCALENDAR) are ignored", async () => {
    mockFromURL.mockResolvedValueOnce({
      tz: { type: "VTIMEZONE", tzid: "Europe/London" },
      cal: { type: "VCALENDAR" },
      evt: makeVEvent({ uid: "real-event" }),
    } as never);

    const result = await getUpcomingEvents([calEntry()], 10, 30);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("real-event");
  });
});
