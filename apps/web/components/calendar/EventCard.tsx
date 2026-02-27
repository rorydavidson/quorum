import Link from 'next/link';
import { Clock, MapPin, Video, ChevronRight } from 'lucide-react';
import type { CalendarEvent } from '@snomed/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VIRTUAL_KEYWORDS = ['meet.google.com', 'zoom.us', 'teams.microsoft.com', 'webex.com', 'whereby.com', 'gotomeeting.com'];

function isVirtualLocation(location?: string): boolean {
  if (!location) return false;
  const lc = location.toLowerCase();
  return VIRTUAL_KEYWORDS.some((kw) => lc.includes(kw));
}

function formatEventTimes(start: string, end: string): {
  dayLabel: string;
  monthLabel: string;
  dayNum: number;
  timeRange: string;
  isMultiDay: boolean;
} {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();

  const dayLabel = s.toLocaleDateString('en-GB', { weekday: 'short' });
  const monthLabel = s.toLocaleDateString('en-GB', { month: 'short' });
  const dayNum = s.getDate();

  if (!sameDay) {
    const endStr = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const startStr = s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return { dayLabel, monthLabel, dayNum, timeRange: `${startStr} – ${endStr}`, isMultiDay: true };
  }

  const startTime = s.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const endTime = e.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return { dayLabel, monthLabel, dayNum, timeRange: `${startTime} – ${endTime} UTC`, isMultiDay: false };
}

function daysUntil(isoStart: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const then = new Date(isoStart);
  then.setHours(0, 0, 0, 0);
  return Math.round((then.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EventCardProps {
  event: CalendarEvent;
}

export function EventCard({ event }: EventCardProps) {
  const { dayLabel, monthLabel, dayNum, timeRange, isMultiDay } = formatEventTimes(event.start, event.end);
  const days = daysUntil(event.start);
  const isImminent = days >= 0 && days <= 7;
  const isVirtual = isVirtualLocation(event.location);
  // Physical location: show if present and not a URL
  const physicalLocation = event.location && !isVirtual ? event.location : undefined;

  return (
    <Link
      href={`/spaces/${event.spaceId}/events/${event.id}`}
      className="group flex items-start gap-4 rounded-lg border border-snomed-border bg-white p-4 shadow-sm hover:shadow-md active:shadow-sm transition-shadow min-h-[44px]"
    >
      {/* Date block */}
      <div className="flex-shrink-0 w-12 rounded-md flex flex-col items-center justify-center py-1.5 bg-snomed-blue text-white">
        <span className="text-[10px] font-semibold uppercase leading-none opacity-80">
          {monthLabel}
        </span>
        <span className="text-xl font-bold leading-tight tabular-nums" aria-label={`Day ${dayNum}`}>
          {dayNum}
        </span>
        <span className="text-[10px] leading-none opacity-70 mt-0.5">{dayLabel}</span>
      </div>

      {/* Event details */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-snomed-grey leading-snug group-hover:text-snomed-blue transition-colors">
          {event.summary}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Time / date range */}
          <span className="flex items-center gap-1 text-xs text-snomed-grey/60">
            <Clock size={11} aria-hidden="true" />
            {isMultiDay ? timeRange : timeRange}
          </span>

          {/* Virtual indicator */}
          {isVirtual && (
            <span className="flex items-center gap-1 text-xs text-snomed-grey/60">
              <Video size={11} aria-hidden="true" />
              Virtual
            </span>
          )}

          {/* Physical location */}
          {physicalLocation && (
            <span className="flex items-center gap-1 text-xs text-snomed-grey/60 truncate max-w-[200px]">
              <MapPin size={11} aria-hidden="true" />
              {physicalLocation}
            </span>
          )}
        </div>

        {/* Space badge + imminence badge */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-snomed-blue text-white">
            {event.spaceName}
          </span>
          {isImminent && days >= 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
              {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
            </span>
          )}
        </div>
      </div>

      <ChevronRight
        size={16}
        className="flex-shrink-0 mt-1 text-snomed-grey/30 group-hover:text-snomed-blue transition-colors"
        aria-hidden="true"
      />
    </Link>
  );
}
