import { google } from 'googleapis';
import nodeIcal from 'node-ical';
import type { VEvent, ParameterValue } from 'node-ical';
import type { CalendarEvent } from '@snomed/types';

// ---------------------------------------------------------------------------
// Google Calendar client — same Service Account as Drive
// ---------------------------------------------------------------------------

function getCalendarClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !key) {
    throw new Error(
      'Google Service Account credentials not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)'
    );
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  return google.calendar({ version: 'v3', auth });
}

// Lazy singleton
let _calendar: ReturnType<typeof getCalendarClient> | null = null;

function calendarClient() {
  if (!_calendar) _calendar = getCalendarClient();
  return _calendar;
}

function isServiceAccountMode(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

// ---------------------------------------------------------------------------
// Internal type — events without space context (added by the route layer)
// ---------------------------------------------------------------------------

type RawEvent = Omit<CalendarEvent, 'spaceId' | 'spaceName'>;

// ---------------------------------------------------------------------------
// Mock events — future dates relative to today (2026-02-26)
// Shown only when NO calendarId is configured OR iCal fetch fails for all.
// ---------------------------------------------------------------------------

const MOCK_RAW_EVENTS: RawEvent[] = [
  {
    id: 'mock-cal-1',
    summary: 'Board of Management — Q1 2026 Meeting',
    start: '2026-03-10T09:00:00Z',
    end: '2026-03-10T12:00:00Z',
    location: 'Copenhagen, Denmark',
  },
  {
    id: 'mock-cal-2',
    summary: 'Technical Committee — Terminology Release Review',
    start: '2026-03-17T13:00:00Z',
    end: '2026-03-17T15:00:00Z',
    location: 'https://meet.google.com/abc-def-ghi',
  },
  {
    id: 'mock-cal-3',
    summary: 'Editorial Advisory Committee — March Session',
    start: '2026-03-24T10:00:00Z',
    end: '2026-03-24T11:30:00Z',
    location: 'https://zoom.us/j/123456789',
  },
  {
    id: 'mock-cal-4',
    summary: 'General Assembly — Annual Review',
    start: '2026-04-07T08:00:00Z',
    end: '2026-04-08T17:00:00Z',
    location: 'Amsterdam, Netherlands',
  },
  {
    id: 'mock-cal-5',
    summary: 'Board of Management — Emergency Briefing',
    start: '2026-04-14T14:00:00Z',
    end: '2026-04-14T15:00:00Z',
    location: 'https://teams.microsoft.com/l/meetup-join/placeholder',
  },
];

// ---------------------------------------------------------------------------
// Helpers — Google Calendar API event mapper
// ---------------------------------------------------------------------------

/** Normalise a Google Calendar event item into our RawEvent shape. */
function mapGoogleEvent(item: {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  location?: string | null;
  htmlLink?: string | null;
}): RawEvent {
  return {
    id: item.id ?? '',
    summary: item.summary ?? '(No title)',
    description: item.description ?? undefined,
    start: item.start?.dateTime ?? item.start?.date ?? new Date().toISOString(),
    end: item.end?.dateTime ?? item.end?.date ?? new Date().toISOString(),
    location: item.location ?? undefined,
    htmlLink: item.htmlLink ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers — iCal event mapper
// ---------------------------------------------------------------------------

/** Extract a plain string from a node-ical ParameterValue. */
function paramVal(v: ParameterValue | undefined): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v || undefined;
  if (typeof v === 'object' && 'val' in v) return String(v.val) || undefined;
  return String(v) || undefined;
}

/** Map a node-ical VEvent into our RawEvent shape. */
function mapICalEvent(event: VEvent): RawEvent {
  const startDate = event.start instanceof Date ? event.start : new Date(String(event.start));
  const endDate = event.end instanceof Date ? event.end : new Date(String(event.end));

  return {
    id: event.uid ?? `ical-${startDate.toISOString()}`,
    summary: paramVal(event.summary) ?? '(No title)',
    description: paramVal(event.description),
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    location: paramVal(event.location),
    htmlLink: event.url ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// iCal fetching — public Google Calendar iCal URL (no credentials needed)
// ---------------------------------------------------------------------------

/**
 * Extract a raw calendar ID from whatever the admin pasted.
 * Handles plain IDs and Google Calendar embed / share URLs:
 *   https://calendar.google.com/calendar/embed?src=ID&ctz=...
 *   https://calendar.google.com/calendar/r?cid=ID
 */
function extractCalendarId(calendarIdOrUrl: string): string {
  const trimmed = calendarIdOrUrl.trim();
  if (!trimmed.startsWith('http')) return trimmed; // already a raw ID
  try {
    const url = new URL(trimmed);
    if (url.hostname === 'calendar.google.com') {
      const src = url.searchParams.get('src') ?? url.searchParams.get('cid');
      if (src) return decodeURIComponent(src);
    }
  } catch {
    // not a valid URL — return as-is
  }
  return trimmed;
}

/**
 * Build the public iCal URL for a Google Calendar ID (or embed URL).
 * Works when the calendar is shared publicly in Google Calendar settings.
 */
function googleCalendarICalUrl(calendarId: string): string {
  const cleanId = extractCalendarId(calendarId);
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(cleanId)}/public/basic.ics`;
}

/**
 * Attempt to fetch upcoming events from an iCal feed URL.
 * Returns an empty array (rather than throwing) if the feed is private or unreachable.
 */
async function fetchICalEvents(
  /** Direct iCal URL, or if absent, a Google Calendar ID (public iCal URL will be derived). */
  urlOrCalendarId: string,
  options: { timeMin: Date; timeMax: Date; maxResults: number },
  /** If true, treat urlOrCalendarId as a Google Calendar ID and derive the public iCal URL. */
  deriveGoogleUrl = false
): Promise<RawEvent[]> {
  const url = deriveGoogleUrl ? googleCalendarICalUrl(urlOrCalendarId) : urlOrCalendarId;

  const data = await nodeIcal.async.fromURL(url);

  const events: RawEvent[] = [];

  for (const component of Object.values(data)) {
    if (!component || component.type !== 'VEVENT') continue;
    const vevent = component as VEvent;

    // Skip cancelled events
    if (vevent.status === 'CANCELLED') continue;

    const start = vevent.start instanceof Date ? vevent.start : new Date(String(vevent.start));
    const end = vevent.end instanceof Date ? vevent.end : new Date(String(vevent.end ?? start));

    // Only upcoming events within the window
    if (end < options.timeMin || start > options.timeMax) continue;

    events.push(mapICalEvent(vevent));
  }

  // Sort by start date
  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return events.slice(0, options.maxResults);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CalendarEntry {
  calendarId: string;
  icalUrl?: string;    // Direct iCal/ICS feed URL — takes priority over derived Google iCal URL
  spaceId: string;
  spaceName: string;
}

/**
 * List upcoming events for a single Google Calendar using the Service Account API.
 * Returns empty array when SA is not configured — use getUpcomingEvents instead.
 */
export async function listEvents(
  calendarId: string,
  options: { maxResults?: number; timeMin?: string; timeMax?: string } = {}
): Promise<RawEvent[]> {
  if (!isServiceAccountMode()) return [];

  const { maxResults = 50, timeMin = new Date().toISOString(), timeMax } = options;

  const res = await calendarClient().events.list({
    calendarId,
    timeMin,
    ...(timeMax ? { timeMax } : {}),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (res.data.items ?? [])
    .filter((e) => e.status !== 'cancelled')
    .map(mapGoogleEvent);
}

/**
 * Fetch upcoming events across all provided calendars, merged and sorted by start time.
 *
 * Priority order:
 *  1. Google Calendar API (Service Account) — when SA credentials are configured
 *  2. Public iCal feeds — when no SA but calendarIds are configured (works for public calendars)
 *  3. Mock data — fallback when no real events can be fetched at all
 */
export async function getUpcomingEvents(
  calendars: CalendarEntry[],
  limit = 10,
  days = 30
): Promise<CalendarEvent[]> {
  if (calendars.length === 0) return [];

  const now = new Date();
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // ------------------------------------------------------------------
  // Tier 1: Google Calendar API via Service Account
  // ------------------------------------------------------------------
  if (isServiceAccountMode()) {
    const results = await Promise.allSettled(
      calendars.map(async (entry) => {
        const events = await listEvents(entry.calendarId, {
          maxResults: limit,
          timeMin: now.toISOString(),
          timeMax: timeMax.toISOString(),
        });
        return events.map((e): CalendarEvent => ({
          ...e,
          spaceId: entry.spaceId,
          spaceName: entry.spaceName,
        }));
      })
    );

    const allEvents: CalendarEvent[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        allEvents.push(...result.value);
      } else {
        console.error(
          `[calendar] SA: failed to fetch calendar ${calendars[i].calendarId}:`,
          result.reason
        );
      }
    }

    return allEvents
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, limit);
  }

  // ------------------------------------------------------------------
  // Tier 2: iCal feeds (no SA credentials required)
  // Priority: icalUrl (direct feed URL) > Google Calendar public iCal URL (derived from calendarId)
  // ------------------------------------------------------------------
  const icalResults = await Promise.allSettled(
    calendars.map(async (entry) => {
      const useDirectUrl = !!entry.icalUrl;
      const urlOrId = entry.icalUrl ?? entry.calendarId;
      const events = await fetchICalEvents(
        urlOrId,
        { timeMin: now, timeMax, maxResults: limit },
        !useDirectUrl // deriveGoogleUrl only when no direct icalUrl is provided
      );
      return events.map((e): CalendarEvent => ({
        ...e,
        spaceId: entry.spaceId,
        spaceName: entry.spaceName,
      }));
    })
  );

  const icalEvents: CalendarEvent[] = [];
  let anyICalSuccess = false;

  for (let i = 0; i < icalResults.length; i++) {
    const result = icalResults[i];
    const label = calendars[i].icalUrl ?? calendars[i].calendarId;
    if (result.status === 'fulfilled') {
      anyICalSuccess = true;
      icalEvents.push(...result.value);
      if (result.value.length > 0) {
        console.log(`[calendar] iCal: fetched ${result.value.length} events from ${label}`);
      } else {
        console.log(
          `[calendar] iCal: 0 upcoming events from ${label} (calendar may be empty or events outside window)`
        );
      }
    } else {
      console.warn(
        `[calendar] iCal: could not fetch ${label} — check that the URL is correct and publicly accessible.`,
        String(result.reason).split('\n')[0]
      );
    }
  }

  // If at least one iCal request succeeded (even if 0 events), trust it over mock data.
  // This ensures an empty calendar shows as empty, not as mock events.
  if (anyICalSuccess) {
    return icalEvents
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, limit);
  }

  // ------------------------------------------------------------------
  // Tier 3: Mock data — all iCal fetches failed (private calendars or network error)
  // ------------------------------------------------------------------
  console.log('[calendar] All iCal fetches failed — using mock events');
  return MOCK_RAW_EVENTS.slice(0, limit).map((e, i) => ({
    ...e,
    spaceId: calendars[i % calendars.length].spaceId,
    spaceName: calendars[i % calendars.length].spaceName,
  }));
}
