import Link from 'next/link';
import { FileText, FileSpreadsheet, FolderOpen, ChevronRight, Star } from 'lucide-react';
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth';
import { getUpcomingEvents, getAccessibleSpaces } from '@/lib/api-client';
import { CalendarWidget } from '@/components/calendar/CalendarWidget';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const headersList = await headers();
  const cookie = headersList.get('cookie') ?? '';

  const [user, events, spaces] = await Promise.all([
    getUser(),
    getUpcomingEvents(cookie, 10, 60).catch(() => []),
    getAccessibleSpaces(cookie).catch(() => []),
  ]);

  const firstName = user?.given_name ?? user?.name?.split(' ')[0] ?? 'there';

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
        <CalendarWidget events={events} />

        {/* ------------------------------------------------------------------ */}
        {/* Right: Quick access spaces                                          */}
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

            {spaces.length === 0 ? (
              <p className="px-4 py-6 text-sm text-snomed-grey/50 text-center">
                No spaces configured yet.
              </p>
            ) : (
              <div className="divide-y divide-snomed-border">
                {spaces.slice(0, 6).map((space) => (
                  <Link
                    key={space.id}
                    href={`/spaces/${space.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors group min-h-[44px]"
                  >
                    <div
                      className="flex-shrink-0 w-2 h-2 rounded-full bg-snomed-blue"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-snomed-grey truncate group-hover:text-snomed-blue transition-colors">
                        {space.name}
                      </p>
                      <p className="text-[11px] text-snomed-grey/50">{space.hierarchyCategory}</p>
                    </div>
                    <ChevronRight
                      size={13}
                      className="flex-shrink-0 text-snomed-grey/30 group-hover:text-snomed-blue transition-colors"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent documents — placeholder until Phase 6 (unified search) provides cross-space recents */}
          <div className="rounded-lg border border-snomed-border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-snomed-border">
              <h2 className="text-sm font-semibold text-snomed-grey flex items-center gap-2">
                <FileText size={15} className="text-snomed-blue" aria-hidden="true" />
                Recent Documents
              </h2>
            </div>
            <RecentDocumentsPlaceholder spaces={spaces} />
            <div className="px-4 py-2.5 border-t border-snomed-border">
              <Link href="/spaces" className="text-xs text-snomed-blue hover:underline">
                Browse all documents →
              </Link>
            </div>
          </div>

        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent documents — shows placeholder rows per accessible space.
// Full cross-space recent docs will be wired in Phase 6 (unified search).
// ---------------------------------------------------------------------------

function RecentDocumentsPlaceholder({
  spaces,
}: {
  spaces: { id: string; name: string }[];
}) {
  if (spaces.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-snomed-grey/50 text-center">
        No spaces available.
      </p>
    );
  }

  // Show one entry per space (up to 5) directing users to browse each space
  return (
    <div className="divide-y divide-snomed-border">
      {spaces.slice(0, 5).map((space) => (
        <Link
          key={space.id}
          href={`/spaces/${space.id}`}
          className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors group min-h-[44px]"
        >
          <FolderOpen
            size={15}
            className="flex-shrink-0 mt-0.5 text-snomed-blue"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-snomed-grey truncate group-hover:text-snomed-blue transition-colors leading-snug">
              {space.name}
            </p>
            <p className="text-[11px] text-snomed-grey/50 mt-0.5">Browse documents →</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
