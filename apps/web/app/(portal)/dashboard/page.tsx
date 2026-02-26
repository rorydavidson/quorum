import Link from 'next/link';
import {
  Calendar,
  Clock,
  MapPin,
  FileText,
  FileSpreadsheet,
  FolderOpen,
  ChevronRight,
  Star,
  Video,
} from 'lucide-react';
import { getUser } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Mock data — shaped identically to what Phase 5 will return from the BFF
// ---------------------------------------------------------------------------

interface MockEvent {
  id: string;
  summary: string;
  start: string; // ISO 8601
  end: string;
  location?: string;
  isVirtual?: boolean;
  spaceName: string;
  spaceId: string;
  spaceColor: string;
}

interface MockDocument {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  spaceName: string;
  spaceId: string;
  isOfficialRecord: boolean;
  size?: number;
}

const MOCK_EVENTS: MockEvent[] = [
  {
    id: 'evt-1',
    summary: 'Board of Management — Q1 2025 Meeting',
    start: '2025-03-18T09:00:00Z',
    end: '2025-03-18T12:00:00Z',
    location: 'Copenhagen, Denmark',
    isVirtual: false,
    spaceName: 'Board of Management',
    spaceId: 'board',
    spaceColor: '#009FE3',
  },
  {
    id: 'evt-2',
    summary: 'Technical Committee — Terminology Release Review',
    start: '2025-03-20T13:00:00Z',
    end: '2025-03-20T15:00:00Z',
    isVirtual: true,
    spaceName: 'Technical Committee',
    spaceId: 'technical-committee',
    spaceColor: '#7C3AED',
  },
  {
    id: 'evt-3',
    summary: 'Editorial Advisory Committee — March Session',
    start: '2025-03-25T10:00:00Z',
    end: '2025-03-25T11:30:00Z',
    isVirtual: true,
    spaceName: 'Editorial Advisory Committee',
    spaceId: 'editorial-committee',
    spaceColor: '#059669',
  },
  {
    id: 'evt-4',
    summary: 'General Assembly — Annual Review',
    start: '2025-04-08T08:00:00Z',
    end: '2025-04-09T17:00:00Z',
    location: 'Amsterdam, Netherlands',
    isVirtual: false,
    spaceName: 'General Assembly',
    spaceId: 'general-assembly',
    spaceColor: '#D97706',
  },
  {
    id: 'evt-5',
    summary: 'Board of Management — Emergency Briefing',
    start: '2025-04-15T14:00:00Z',
    end: '2025-04-15T15:00:00Z',
    isVirtual: true,
    spaceName: 'Board of Management',
    spaceId: 'board',
    spaceColor: '#009FE3',
  },
];

const MOCK_RECENT_DOCS: MockDocument[] = [
  {
    id: 'mock-file-1',
    name: 'Board Meeting Agenda – March 2025.pdf',
    mimeType: 'application/pdf',
    modifiedTime: '2025-03-10T14:30:00Z',
    spaceName: 'Board of Management',
    spaceId: 'board',
    isOfficialRecord: false,
    size: 0.42,
  },
  {
    id: 'mock-file-2',
    name: '_OFFICIAL_RECORD_2024-12-15_Annual-Report.pdf',
    mimeType: 'application/pdf',
    modifiedTime: '2024-12-15T10:00:00Z',
    spaceName: 'Board of Management',
    spaceId: 'board',
    isOfficialRecord: true,
    size: 2.1,
  },
  {
    id: 'mock-file-3',
    name: 'Q1 Financial Summary.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    modifiedTime: '2025-02-28T16:45:00Z',
    spaceName: 'Board of Management',
    spaceId: 'board',
    isOfficialRecord: false,
    size: 0.18,
  },
  {
    id: 'mock-file-4',
    name: 'Governance Framework v3.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    modifiedTime: '2025-01-20T09:15:00Z',
    spaceName: 'Board of Management',
    spaceId: 'board',
    isOfficialRecord: false,
    size: 0.31,
  },
  {
    id: 'mock-file-5',
    name: 'Strategic Plan 2025–2030.pdf',
    mimeType: 'application/pdf',
    modifiedTime: '2025-01-05T12:00:00Z',
    spaceName: 'Board of Management',
    spaceId: 'board',
    isOfficialRecord: false,
    size: 1.75,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEventDate(start: string, end: string): { date: string; time: string; isMultiDay: boolean } {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();

  const date = s.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  if (!sameDay) {
    const endDate = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return { date: `${date} – ${endDate}`, time: '', isMultiDay: true };
  }

  const time = `${s.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} UTC`;
  return { date, time, isMultiDay: false };
}

function groupEventsByMonth(events: MockEvent[]): { month: string; events: MockEvent[] }[] {
  const groups = new Map<string, MockEvent[]>();
  for (const evt of events) {
    const month = new Date(evt.start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month)!.push(evt);
  }
  return Array.from(groups.entries()).map(([month, events]) => ({ month, events }));
}

function daysUntil(iso: string): number {
  const now = new Date();
  const then = new Date(iso);
  return Math.ceil((then.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function docIcon(mimeType: string) {
  if (mimeType === 'application/pdf' || mimeType.includes('wordprocessingml')) {
    return FileText;
  }
  if (mimeType.includes('spreadsheetml') || mimeType === 'application/vnd.ms-excel') {
    return FileSpreadsheet;
  }
  return FileText;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const user = await getUser();
  const firstName = user?.given_name ?? user?.name?.split(' ')[0] ?? 'there';
  const eventGroups = groupEventsByMonth(MOCK_EVENTS);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">

      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-snomed-grey">
          Good morning, {firstName}
        </h1>
        <p className="mt-1 text-sm text-snomed-grey/60">
          Here&apos;s what&apos;s coming up across your spaces.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">

        {/* ------------------------------------------------------------------ */}
        {/* Left: Upcoming meetings                                             */}
        {/* ------------------------------------------------------------------ */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-snomed-grey flex items-center gap-2">
              <Calendar size={16} className="text-snomed-blue" aria-hidden="true" />
              Upcoming Meetings
            </h2>
            <span className="text-xs text-snomed-grey/40 italic">Mock data</span>
          </div>

          <div className="space-y-6">
            {eventGroups.map(({ month, events }) => (
              <div key={month}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-snomed-grey/40">
                  {month}
                </p>
                <div className="space-y-2">
                  {events.map((evt) => {
                    const { date, time, isMultiDay } = formatEventDate(evt.start, evt.end);
                    const days = daysUntil(evt.start);
                    const isImminent = days >= 0 && days <= 7;

                    return (
                      <Link
                        key={evt.id}
                        href={`/spaces/${evt.spaceId}`}
                        className="group flex items-start gap-4 rounded-lg border border-snomed-border bg-white p-4 shadow-sm hover:shadow-md active:shadow-sm transition-shadow"
                      >
                        {/* Date block */}
                        <div
                          className="flex-shrink-0 w-12 rounded-md flex flex-col items-center justify-center py-1.5 text-white"
                          style={{ backgroundColor: evt.spaceColor }}
                        >
                          <span className="text-[10px] font-semibold uppercase leading-none opacity-80">
                            {new Date(evt.start).toLocaleDateString('en-GB', { month: 'short' })}
                          </span>
                          <span className="text-xl font-bold leading-tight tabular-nums">
                            {new Date(evt.start).getDate()}
                          </span>
                        </div>

                        {/* Event details */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-snomed-grey truncate group-hover:text-snomed-blue transition-colors">
                            {evt.summary}
                          </p>

                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {!isMultiDay && time && (
                              <span className="flex items-center gap-1 text-xs text-snomed-grey/60">
                                <Clock size={11} aria-hidden="true" />
                                {time}
                              </span>
                            )}
                            {isMultiDay && (
                              <span className="flex items-center gap-1 text-xs text-snomed-grey/60">
                                <Clock size={11} aria-hidden="true" />
                                {date}
                              </span>
                            )}
                            {evt.isVirtual && (
                              <span className="flex items-center gap-1 text-xs text-snomed-grey/60">
                                <Video size={11} aria-hidden="true" />
                                Virtual
                              </span>
                            )}
                            {evt.location && (
                              <span className="flex items-center gap-1 text-xs text-snomed-grey/60">
                                <MapPin size={11} aria-hidden="true" />
                                {evt.location}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: evt.spaceColor }}
                            >
                              {evt.spaceName}
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
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Right: Quick access + Recent documents                              */}
        {/* ------------------------------------------------------------------ */}
        <aside className="space-y-6">

          {/* Quick access — spaces */}
          <div className="rounded-lg border border-snomed-border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-snomed-border">
              <h2 className="text-sm font-semibold text-snomed-grey flex items-center gap-2">
                <FolderOpen size={15} className="text-snomed-blue" aria-hidden="true" />
                Your Spaces
              </h2>
              <Link href="/spaces" className="text-xs text-snomed-blue hover:underline">
                View all
              </Link>
            </div>
            <div className="divide-y divide-snomed-border">
              {[
                { id: 'board', name: 'Board of Management', category: 'Board Level', color: '#009FE3' },
                { id: 'general-assembly', name: 'General Assembly', category: 'Board Level', color: '#D97706' },
                { id: 'technical-committee', name: 'Technical Committee', category: 'Working Groups', color: '#7C3AED' },
                { id: 'editorial-committee', name: 'Editorial Advisory Committee', category: 'Working Groups', color: '#059669' },
                { id: 'executive', name: 'Executive', category: 'Administration', color: '#DC2626' },
              ].map((space) => (
                <Link
                  key={space.id}
                  href={`/spaces/${space.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors group"
                >
                  <div
                    className="flex-shrink-0 w-2 h-2 rounded-full"
                    style={{ backgroundColor: space.color }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-snomed-grey truncate group-hover:text-snomed-blue transition-colors">
                      {space.name}
                    </p>
                    <p className="text-[11px] text-snomed-grey/50">{space.category}</p>
                  </div>
                  <ChevronRight size={13} className="flex-shrink-0 text-snomed-grey/30 group-hover:text-snomed-blue transition-colors" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>

          {/* Recent documents */}
          <div className="rounded-lg border border-snomed-border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-snomed-border">
              <h2 className="text-sm font-semibold text-snomed-grey flex items-center gap-2">
                <FileText size={15} className="text-snomed-blue" aria-hidden="true" />
                Recent Documents
              </h2>
              <span className="text-xs text-snomed-grey/40 italic">Mock data</span>
            </div>
            <div className="divide-y divide-snomed-border">
              {MOCK_RECENT_DOCS.map((doc) => {
                const Icon = docIcon(doc.mimeType);
                return (
                  <Link
                    key={doc.id}
                    href={`/spaces/${doc.spaceId}`}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors group"
                  >
                    <Icon
                      size={15}
                      className="flex-shrink-0 mt-0.5 text-snomed-blue"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-snomed-grey truncate group-hover:text-snomed-blue transition-colors leading-snug">
                        {doc.name.replace(/^_OFFICIAL_RECORD_\d{4}-\d{2}-\d{2}_/, '')}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-snomed-grey/50">
                          {formatRelativeDate(doc.modifiedTime)}
                        </span>
                        {doc.isOfficialRecord && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700">
                            <Star size={9} aria-hidden="true" />
                            Official Record
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-snomed-border">
              <Link
                href="/spaces"
                className="text-xs text-snomed-blue hover:underline"
              >
                Browse all documents →
              </Link>
            </div>
          </div>

        </aside>
      </div>
    </div>
  );
}
