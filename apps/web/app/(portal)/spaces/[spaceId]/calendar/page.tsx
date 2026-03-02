import { headers } from 'next/headers';
import Link from 'next/link';
import { ChevronRight, Calendar, Clock, MapPin, Video } from 'lucide-react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { getSpaceFiles, getSpaceEvents } from '@/lib/api-client';
import type { CalendarEvent } from '@snomed/types';

interface Props {
  params: Promise<{ spaceId: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VIRTUAL_KEYWORDS = ['meet.google.com', 'zoom.us', 'teams.microsoft.com', 'webex.com', 'whereby.com'];

function isVirtualLocation(location?: string): boolean {
  if (!location) return false;
  return VIRTUAL_KEYWORDS.some((kw) => location.toLowerCase().includes(kw));
}

function formatEventDateFull(start: string, end: string): {
  dateLabel: string;
  timeLabel: string;
  isMultiDay: boolean;
  dayNum: number;
  monthLabel: string;
} {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();

  const dayNum = s.getUTCDate();
  const monthLabel = s.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const dateLabel = s.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  if (!sameDay) {
    const endLabel = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { dateLabel: `${dateLabel} – ${endLabel}`, timeLabel: 'Multi-day event', isMultiDay: true, dayNum, monthLabel };
  }

  const startTime = s.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });
  const endTime = e.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });
  return { dateLabel, timeLabel: `${startTime} – ${endTime} UTC`, isMultiDay: false, dayNum, monthLabel };
}

function groupEventsByMonth(events: CalendarEvent[]): { month: string; events: CalendarEvent[] }[] {
  const groups = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const month = new Date(evt.start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month)!.push(evt);
  }
  return Array.from(groups.entries()).map(([month, evts]) => ({ month, events: evts }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SpaceCalendarPage({ params }: Props) {
  const { spaceId } = await params;
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';

  const [spaceResult, eventsResult] = await Promise.allSettled([
    getSpaceFiles(spaceId, cookie),
    getSpaceEvents(spaceId, cookie, 50, 365),
  ]);

  const space = spaceResult.status === 'fulfilled' ? spaceResult.value.space : null;
  const events: CalendarEvent[] = eventsResult.status === 'fulfilled' ? eventsResult.value : [];
  const groups = groupEventsByMonth(events);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Spaces', href: '/spaces' },
          { label: space?.name ?? spaceId, href: `/spaces/${spaceId}` },
          { label: 'Calendar' },
        ]}
      />

      {/* Header */}
      <div className="mb-8 flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-snomed-blue-light flex items-center justify-center">
          <Calendar size={24} className="text-snomed-blue" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-snomed-grey">
            {space?.name ?? 'Space'} — Calendar
          </h1>
          <p className="mt-1 text-sm text-snomed-grey/60">
            Upcoming meetings for the next 12 months
          </p>
        </div>
      </div>

      {/* Events */}
      {events.length === 0 ? (
        <div className="rounded-lg border border-snomed-border bg-white p-12 text-center shadow-sm">
          <Calendar size={40} className="mx-auto mb-4 text-snomed-grey/20" aria-hidden="true" />
          <p className="text-sm font-medium text-snomed-grey">No upcoming meetings</p>
          <p className="mt-1 text-xs text-snomed-grey/50">
            {(space?.calendarId || space?.icalUrl)
              ? 'There are no scheduled meetings in the next 12 months.'
              : 'No calendar has been linked to this space yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ month, events: monthEvents }) => (
            <div key={month}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-snomed-grey/40">
                {month}
              </h2>
              <div className="space-y-3">
                {monthEvents.map((evt) => {
                  const { dateLabel, timeLabel, isMultiDay, dayNum, monthLabel } = formatEventDateFull(evt.start, evt.end);
                  const isVirtual = isVirtualLocation(evt.location);
                  const physicalLocation = evt.location && !isVirtual ? evt.location : undefined;

                  return (
                    <Link
                      href={`/spaces/${spaceId}/events/${evt.id}`}
                      key={evt.id}
                      className="group flex items-start gap-4 rounded-lg border border-snomed-border bg-white p-5 shadow-sm hover:border-snomed-blue/30 hover:shadow-md transition-all active:scale-[0.99]"
                    >
                      {/* Date block */}
                      <div className="flex-shrink-0 w-14 rounded-lg bg-snomed-blue text-white flex flex-col items-center justify-center py-2">
                        <span className="text-[10px] font-semibold uppercase leading-none opacity-80">
                          {monthLabel}
                        </span>
                        <span className="text-2xl font-bold leading-tight tabular-nums">
                          {dayNum}
                        </span>
                      </div>

                      {/* Details */}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-snomed-grey group-hover:text-snomed-blue transition-colors">
                          {evt.summary}
                        </p>
                        {evt.description && (
                          <p className="mt-1 text-sm text-snomed-grey/60 line-clamp-2">
                            {evt.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-snomed-grey/60">
                          <span className="flex items-center gap-1">
                            <Clock size={11} aria-hidden="true" />
                            {isMultiDay ? dateLabel : `${dateLabel} · ${timeLabel}`}
                          </span>
                          {isVirtual && (
                            <span className="flex items-center gap-1 text-snomed-blue font-medium">
                              <Video size={11} aria-hidden="true" />
                              Virtual meeting
                            </span>
                          )}
                          {physicalLocation && (
                            <span className="flex items-center gap-1">
                              <MapPin size={11} aria-hidden="true" />
                              {physicalLocation}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                        <ChevronRight size={20} className="text-snomed-blue" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
