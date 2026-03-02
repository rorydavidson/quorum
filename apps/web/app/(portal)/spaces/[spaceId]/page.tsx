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
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { getSpaceFiles, getSpaceEvents, getSpaceForumTopics } from '@/lib/api-client';
import type { SpaceWithFiles } from '@/lib/api-client';
import type { CalendarEvent, DiscoursePost, DriveFile, SpaceSection } from '@snomed/types';
import { ForumWidget } from '@/components/forum/ForumWidget';

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function EventRow({ spaceId, event }: { spaceId: string; event: CalendarEvent }) {
  const { day, month, time } = formatEventDate(event.start);
  const isVirtual = isVirtualLocation(event.location);
  const physicalLocation = event.location && !isVirtual ? event.location : undefined;

  return (
    <Link
      href={`/spaces/${spaceId}/events/${event.id}`}
      className="flex items-start gap-4 px-5 py-4 hover:bg-snomed-blue-light/20 transition-colors group"
    >
      <div className="flex-shrink-0 w-11 text-center">
        <p className="text-lg font-bold leading-none text-snomed-blue">{day}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-snomed-grey/50 mt-0.5">{month}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-snomed-grey group-hover:text-snomed-blue transition-colors">
          {event.summary}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-snomed-grey/60">
          <span className="flex items-center gap-1">
            <Clock size={11} aria-hidden="true" />
            {time} UTC
          </span>
          {isVirtual && (
            <span className="flex items-center gap-1 text-snomed-blue">
              <Video size={11} aria-hidden="true" />
              Virtual
            </span>
          )}
          {physicalLocation && (
            <span className="flex items-center gap-1 truncate max-w-[200px]">
              <MapPin size={11} aria-hidden="true" />
              {physicalLocation}
            </span>
          )}
        </div>
      </div>
      <ChevronRight
        size={16}
        className="flex-shrink-0 mt-1 text-snomed-grey/25 group-hover:text-snomed-blue transition-colors"
      />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SpaceLandingPage({ params }: Props) {
  const { spaceId } = await params;
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';

  let data: SpaceWithFiles | null = null;
  let error: string | null = null;
  let upcomingEvents: CalendarEvent[] = [];
  let forumTopics: DiscoursePost[] = [];

  const [spaceResult, eventsResult, forumResult] = await Promise.allSettled([
    getSpaceFiles(spaceId, cookie),
    getSpaceEvents(spaceId, cookie, 5, 90),
    getSpaceForumTopics(spaceId, cookie, 5),
  ]);

  if (spaceResult.status === 'fulfilled') {
    data = spaceResult.value;
  } else {
    error = (spaceResult.reason as Error).message;
  }

  if (eventsResult.status === 'fulfilled') {
    upcomingEvents = eventsResult.value;
  }

  if (forumResult.status === 'fulfilled') {
    forumTopics = forumResult.value;
  }

  const space = data?.space;
  const sections: SpaceSection[] = space?.sections ?? [];
  const hasSections = sections.length > 0;
  const recentFiles: DriveFile[] = hasSections ? [] : (data?.files ?? []).slice(0, 4);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Spaces', href: '/spaces' },
          { label: space?.name ?? spaceId },
        ]}
      />

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
            <FileText size={13} aria-hidden="true" />
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
                <FileText size={18} className="text-snomed-blue" aria-hidden="true" />
                <h2 className="font-semibold text-snomed-grey">Documents</h2>
              </div>
              <Link href={`/spaces/${spaceId}/documents`} className="flex items-center gap-1 text-xs text-snomed-blue hover:underline">
                View all <ArrowRight size={12} aria-hidden="true" />
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
                  <FileText size={16} className="flex-shrink-0 mt-0.5 text-snomed-grey/40 group-hover:text-snomed-blue transition-colors" aria-hidden="true" />
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

        {/* Meetings panel */}
        <section className={`rounded-xl border border-snomed-border bg-white shadow-sm overflow-hidden${hasSections ? ' lg:col-span-2' : ''}`}>
          <div className="px-5 py-4 border-b border-snomed-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Calendar size={18} className="text-snomed-blue" aria-hidden="true" />
              <h2 className="font-semibold text-snomed-grey">Upcoming Meetings</h2>
            </div>
            {(space?.calendarId || space?.icalUrl) && (
              <Link
                href={`/spaces/${spaceId}/calendar`}
                className="flex items-center gap-1 text-xs text-snomed-blue hover:underline"
              >
                Full calendar <ArrowRight size={12} aria-hidden="true" />
              </Link>
            )}
          </div>

          <div className={`divide-y divide-snomed-border${hasSections && upcomingEvents.length > 0 ? ' lg:grid lg:grid-cols-3 lg:divide-y-0 lg:divide-x' : ''}`}>
            {upcomingEvents.length === 0 ? (
              <div className="px-5 py-8 text-center col-span-3">
                <p className="text-sm text-snomed-grey/50">No upcoming meetings scheduled</p>
                {!space?.calendarId && !space?.icalUrl && (
                  <p className="mt-1 text-xs text-snomed-grey/40">A calendar has not been linked to this space</p>
                )}
              </div>
            ) : (
              upcomingEvents.map((evt) => <EventRow key={evt.id} spaceId={spaceId} event={evt} />)
            )}
          </div>
        </section>
      </div>

      {/* Discourse forum widget — only rendered when a category slug is configured */}
      {space?.discourseCategorySlug && (
        <div className="mt-6">
          <ForumWidget
            topics={forumTopics}
            categorySlug={space.discourseCategorySlug}
            spaceName={space.name}
          />
        </div>
      )}
    </div>
  );
}
