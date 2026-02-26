import { headers } from 'next/headers';
import Link from 'next/link';
import {
  ChevronRight,
  FolderOpen,
  FileText,
  Folder,
  Calendar,
  Clock,
  MapPin,
  Video,
  ArrowRight,
} from 'lucide-react';
import { getSpaceFiles } from '@/lib/api-client';
import type { SpaceWithFiles } from '@/lib/api-client';
import type { DriveFile, SpaceSection } from '@snomed/types';

interface Props {
  params: Promise<{ spaceId: string }>;
}

interface SpaceEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  isVirtual?: boolean;
}

const MOCK_EVENTS_BY_SPACE: Record<string, SpaceEvent[]> = {
  board: [
    { id: 'evt-b1', summary: 'Board of Management — Q1 2026 Meeting', start: '2026-03-18T09:00:00Z', end: '2026-03-18T12:00:00Z', location: 'Copenhagen, Denmark', isVirtual: false },
    { id: 'evt-b2', summary: 'Board of Management — Q2 2026 Meeting', start: '2026-06-17T09:00:00Z', end: '2026-06-17T12:00:00Z', isVirtual: true },
  ],
  'general-assembly': [
    { id: 'evt-ga1', summary: 'General Assembly 2026', start: '2026-05-12T09:00:00Z', end: '2026-05-14T17:00:00Z', location: 'London, UK', isVirtual: false },
  ],
  'technical-committee': [
    { id: 'evt-tc1', summary: 'Technical Committee — Bi-monthly Meeting', start: '2026-03-10T14:00:00Z', end: '2026-03-10T16:00:00Z', isVirtual: true },
    { id: 'evt-tc2', summary: 'Technical Committee — Bi-monthly Meeting', start: '2026-05-12T14:00:00Z', end: '2026-05-12T16:00:00Z', isVirtual: true },
  ],
  'editorial-committee': [
    { id: 'evt-ec1', summary: 'Editorial Advisory Committee — Q1 Review', start: '2026-03-25T13:00:00Z', end: '2026-03-25T15:00:00Z', isVirtual: true },
  ],
  executive: [],
};

function formatEventDate(iso: string): { day: string; month: string; time: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-GB', { day: '2-digit', timeZone: 'UTC' }),
    month: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }),
  };
}

function displayFileName(name: string): string {
  return name.replace(/^_OFFICIAL_RECORD_\d{4}-\d{2}-\d{2}_/, '');
}

function mimeLabel(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Spreadsheet';
  if (mimeType.includes('wordprocessing') || mimeType.includes('word')) return 'Word';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'Presentation';
  if (mimeType.includes('google-apps.document')) return 'Google Doc';
  if (mimeType.includes('google-apps.spreadsheet')) return 'Google Sheet';
  if (mimeType.includes('google-apps.presentation')) return 'Google Slides';
  return 'Document';
}

function SectionCard({ spaceId, section }: { spaceId: string; section: SpaceSection }) {
  return (
    <Link
      href={`/spaces/${spaceId}/documents/${section.id}`}
      className="group flex items-center gap-4 rounded-xl border border-snomed-border bg-white px-5 py-4 shadow-sm hover:border-snomed-blue hover:shadow-md transition-all min-h-[44px]"
    >
      <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-snomed-blue-light flex items-center justify-center group-hover:bg-snomed-blue/10 transition-colors">
        <Folder size={20} className="text-snomed-blue" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-snomed-grey group-hover:text-snomed-blue transition-colors">
          {section.name}
        </p>
        {section.description && (
          <p className="text-xs text-snomed-grey/60 mt-0.5 truncate">{section.description}</p>
        )}
      </div>
      <ArrowRight
        size={18}
        className="flex-shrink-0 text-snomed-grey/25 group-hover:text-snomed-blue group-hover:translate-x-0.5 transition-all"
      />
    </Link>
  );
}

export default async function SpaceLandingPage({ params }: Props) {
  const { spaceId } = await params;
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';

  let data: SpaceWithFiles | null = null;
  let error: string | null = null;

  try {
    data = await getSpaceFiles(spaceId, cookie);
  } catch (err) {
    error = (err as Error).message;
  }

  const space = data?.space;
  const sections: SpaceSection[] = space?.sections ?? [];
  const hasSections = sections.length > 0;
  const recentFiles: DriveFile[] = hasSections ? [] : (data?.files ?? []).slice(0, 4);
  const upcomingEvents: SpaceEvent[] = (MOCK_EVENTS_BY_SPACE[spaceId] ?? []).slice(0, 3);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-snomed-grey/50">
        <Link href="/spaces" className="hover:text-snomed-blue transition-colors">
          Spaces
        </Link>
        <ChevronRight size={12} aria-hidden="true" />
        <span className="text-snomed-grey font-medium">{space?.name ?? spaceId}</span>
      </nav>

      {/* Space header */}
      <div className="mb-8 flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-snomed-blue-light flex items-center justify-center">
          <FolderOpen size={24} className="text-snomed-blue" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-snomed-grey">{space?.name ?? 'Space'}</h1>
          {space?.description && (
            <p className="mt-1 text-sm text-snomed-grey/60 max-w-xl">{space.description}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load space: {error}
        </div>
      )}

      {/* Document sections — prominent grid when sections are configured */}
      {hasSections && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-snomed-grey/50">
            <FileText size={13} />
            Document Sections
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {sections.map((section) => (
              <SectionCard key={section.id} spaceId={spaceId} section={section} />
            ))}
          </div>
        </section>
      )}

      {/* Two-column lower panel */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Default folder documents — only when no sections */}
        {!hasSections && (
          <section className="rounded-xl border border-snomed-border bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-snomed-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText size={18} className="text-snomed-blue" />
                <h2 className="font-semibold text-snomed-grey">Documents</h2>
              </div>
              <Link href={`/spaces/${spaceId}/documents`} className="flex items-center gap-1 text-xs text-snomed-blue hover:underline">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            <div className="divide-y divide-snomed-border">
              {recentFiles.length === 0 && !error && (
                <div className="px-5 py-8 text-center text-sm text-snomed-grey/50">No documents yet</div>
              )}
              {recentFiles.map((file) => (
                <Link
                  key={file.id}
                  href={`/spaces/${spaceId}/documents`}
                  className="flex items-start gap-3 px-5 py-3.5 hover:bg-snomed-blue-light/30 transition-colors group"
                >
                  <FileText size={16} className="flex-shrink-0 mt-0.5 text-snomed-grey/40 group-hover:text-snomed-blue transition-colors" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-snomed-grey truncate group-hover:text-snomed-blue transition-colors">
                      {displayFileName(file.name)}
                    </p>
                    <p className="text-xs text-snomed-grey/50 mt-0.5">
                      {mimeLabel(file.mimeType)}
                      {file.isOfficialRecord && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                          Official Record
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
              ))}
              {data && data.files.length > 4 && (
                <div className="px-5 py-3 bg-snomed-blue-light/20">
                  <Link href={`/spaces/${spaceId}/documents`} className="text-xs text-snomed-blue hover:underline">
                    View all {data.files.length} documents →
                  </Link>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Meetings panel — spans full width when sections are shown */}
        <section className={`rounded-xl border border-snomed-border bg-white shadow-sm overflow-hidden${hasSections ? ' lg:col-span-2' : ''}`}>
          <div className="px-5 py-4 border-b border-snomed-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Calendar size={18} className="text-snomed-blue" />
              <h2 className="font-semibold text-snomed-grey">Upcoming Meetings</h2>
            </div>
            {space?.calendarId && (
              <Link href={`/spaces/${spaceId}/calendar`} className="flex items-center gap-1 text-xs text-snomed-blue hover:underline">
                Full calendar <ArrowRight size={12} />
              </Link>
            )}
          </div>

          <div className={`divide-y divide-snomed-border${hasSections && upcomingEvents.length > 0 ? ' lg:grid lg:grid-cols-3 lg:divide-y-0 lg:divide-x' : ''}`}>
            {upcomingEvents.length === 0 && (
              <div className="px-5 py-8 text-center col-span-3">
                <p className="text-sm text-snomed-grey/50">No upcoming meetings scheduled</p>
                {!space?.calendarId && (
                  <p className="mt-1 text-xs text-snomed-grey/40">A calendar has not been linked to this space</p>
                )}
              </div>
            )}
            {upcomingEvents.map((evt) => {
              const { day, month, time } = formatEventDate(evt.start);
              return (
                <div key={evt.id} className="flex items-start gap-4 px-5 py-4">
                  <div className="flex-shrink-0 w-11 text-center">
                    <p className="text-lg font-bold leading-none text-snomed-blue">{day}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-snomed-grey/50 mt-0.5">{month}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-snomed-grey">{evt.summary}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-snomed-grey/60">
                      <span className="flex items-center gap-1"><Clock size={11} />{time} UTC</span>
                      {evt.isVirtual ? (
                        <span className="flex items-center gap-1 text-snomed-blue"><Video size={11} />Virtual</span>
                      ) : evt.location ? (
                        <span className="flex items-center gap-1"><MapPin size={11} />{evt.location}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-2.5 border-t border-snomed-border bg-amber-50/50">
            <p className="text-[11px] text-amber-700/70">Mock data · Phase 5 will connect Google Calendar</p>
          </div>
        </section>
      </div>
    </div>
  );
}
