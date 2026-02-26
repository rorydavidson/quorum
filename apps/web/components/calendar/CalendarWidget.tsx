import { Calendar } from 'lucide-react';
import type { CalendarEvent } from '@snomed/types';
import { EventCard } from './EventCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupEventsByDate(events: CalendarEvent[]): { label: string; events: CalendarEvent[] }[] {
  const groups = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const label = new Date(evt.start).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(evt);
  }
  return Array.from(groups.entries()).map(([label, evts]) => ({ label, events: evts }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CalendarWidgetProps {
  events: CalendarEvent[];
}

export function CalendarWidget({ events }: CalendarWidgetProps) {
  const groups = groupEventsByDate(events);

  return (
    <section aria-labelledby="calendar-heading">
      <div className="flex items-center justify-between mb-4">
        <h2
          id="calendar-heading"
          className="text-sm font-semibold text-snomed-grey flex items-center gap-2"
        >
          <Calendar size={16} className="text-snomed-blue" aria-hidden="true" />
          Upcoming Meetings
        </h2>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-snomed-border bg-white p-8 text-center shadow-sm">
          <Calendar size={32} className="mx-auto mb-3 text-snomed-grey/20" aria-hidden="true" />
          <p className="text-sm font-medium text-snomed-grey">No upcoming meetings</p>
          <p className="mt-1 text-xs text-snomed-grey/50">
            There are no scheduled meetings in the next 30 days for your spaces.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ label, events: groupEvents }) => (
            <div key={label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-snomed-grey/40">
                {label}
              </p>
              <div className="space-y-2">
                {groupEvents.map((evt) => (
                  <EventCard key={evt.id} event={evt} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
