import { headers } from 'next/headers';
import Link from 'next/link';
import { FileText, Calendar, Archive, Search } from 'lucide-react';
import { searchAll } from '@/lib/api-client';
import { SearchInput } from '@/components/search/SearchInput';
import type { SearchResult } from '@snomed/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  searchParams: Promise<{ q?: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanFileName(name: string): string {
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

function formatEventDate(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();

  const startDate = s.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  if (!sameDay) {
    const endDate = e.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `${startDate} – ${endDate}`;
  }

  const startTime = s.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  });
  const endTime = e.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  });
  return `${startDate} · ${startTime}–${endTime} UTC`;
}

function resultHref(result: SearchResult): string {
  if (result.type === 'event') {
    return `/spaces/${result.data.spaceId}/calendar`;
  }
  return `/spaces/${result.spaceId}/documents`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FileResultRow({
  result,
}: {
  result: Extract<SearchResult, { type: 'file' | 'archive' }>;
}) {
  const isArchive = result.type === 'archive';
  const displayName = cleanFileName(result.data.name);

  return (
    <Link
      href={resultHref(result)}
      className="group flex items-start gap-4 rounded-lg border border-snomed-border bg-white px-5 py-4 shadow-sm hover:border-snomed-blue hover:shadow-md transition-all"
    >
      {/* Icon block */}
      <div
        className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center ${
          isArchive ? 'bg-amber-50' : 'bg-snomed-blue-light'
        }`}
      >
        {isArchive ? (
          <Archive size={16} className="text-amber-600" aria-hidden="true" />
        ) : (
          <FileText size={16} className="text-snomed-blue" aria-hidden="true" />
        )}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-snomed-grey group-hover:text-snomed-blue transition-colors truncate">
          {displayName}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs text-snomed-grey/50">{mimeLabel(result.data.mimeType)}</span>
          {isArchive && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
              Official Record
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-snomed-blue-light px-1.5 py-0.5 text-[10px] font-medium text-snomed-blue">
            {result.spaceName}
          </span>
        </div>
      </div>
    </Link>
  );
}

function EventResultRow({
  result,
}: {
  result: Extract<SearchResult, { type: 'event' }>;
}) {
  const evt = result.data;
  const dateStr = formatEventDate(evt.start, evt.end);
  const dayNum = new Date(evt.start).getUTCDate();
  const monthLabel = new Date(evt.start).toLocaleDateString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  });

  return (
    <Link
      href={resultHref(result)}
      className="group flex items-start gap-4 rounded-lg border border-snomed-border bg-white px-5 py-4 shadow-sm hover:border-snomed-blue hover:shadow-md transition-all"
    >
      {/* Date block */}
      <div className="flex-shrink-0 w-10 rounded-lg bg-snomed-blue text-white flex flex-col items-center justify-center py-1.5">
        <span className="text-[9px] font-semibold uppercase leading-none opacity-80">
          {monthLabel}
        </span>
        <span className="text-lg font-bold leading-tight tabular-nums">{dayNum}</span>
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-snomed-grey group-hover:text-snomed-blue transition-colors truncate">
          {evt.summary}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs text-snomed-grey/50">{dateStr}</span>
          <span className="inline-flex items-center rounded-full bg-snomed-blue-light px-1.5 py-0.5 text-[10px] font-medium text-snomed-blue">
            {evt.spaceName}
          </span>
        </div>
        {evt.description && (
          <p className="mt-1.5 text-xs text-snomed-grey/60 line-clamp-2">{evt.description}</p>
        )}
      </div>
    </Link>
  );
}

function ResultsGroup({
  label,
  count,
  icon,
  children,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-snomed-grey/40" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-snomed-grey/40">
          {label}
        </h2>
        <span className="text-xs text-snomed-grey/30">({count})</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';

  let results: SearchResult[] = [];
  let error: string | null = null;

  if (query.length >= 2) {
    try {
      results = await searchAll(query, cookie, 50);
    } catch (err) {
      error = (err as Error).message;
    }
  }

  const files = results.filter(
    (r): r is Extract<SearchResult, { type: 'file' }> => r.type === 'file'
  );
  const archives = results.filter(
    (r): r is Extract<SearchResult, { type: 'archive' }> => r.type === 'archive'
  );
  const events = results.filter(
    (r): r is Extract<SearchResult, { type: 'event' }> => r.type === 'event'
  );
  const hasResults = results.length > 0;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-snomed-blue-light flex items-center justify-center">
          <Search size={24} className="text-snomed-blue" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-snomed-grey">Search</h1>
          <p className="mt-1 text-sm text-snomed-grey/60">
            Search across documents, official records, and meetings
          </p>
        </div>
      </div>

      {/* Search input */}
      <div className="mb-8">
        <SearchInput defaultValue={query} />
        {query.length > 0 && query.length < 2 && (
          <p className="mt-2 text-xs text-snomed-grey/50">
            Enter at least 2 characters to search.
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Search failed: {error}
        </div>
      )}

      {/* Empty state — no query */}
      {!query && (
        <div className="rounded-lg border border-snomed-border bg-white p-12 text-center shadow-sm">
          <Search size={40} className="mx-auto mb-4 text-snomed-grey/20" aria-hidden="true" />
          <p className="text-sm font-medium text-snomed-grey">Start typing to search</p>
          <p className="mt-1 text-xs text-snomed-grey/50">
            Search across all documents, official records, and upcoming meetings you have access to.
          </p>
          <p className="mt-4 text-xs text-snomed-grey/40">
            Press{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 border border-snomed-border font-mono text-[11px]">
              ⌘K
            </kbd>{' '}
            anywhere for quick search.
          </p>
        </div>
      )}

      {/* No results */}
      {query.length >= 2 && !hasResults && !error && (
        <div className="rounded-lg border border-snomed-border bg-white p-12 text-center shadow-sm">
          <Search size={40} className="mx-auto mb-4 text-snomed-grey/20" aria-hidden="true" />
          <p className="text-sm font-medium text-snomed-grey">
            No results for &ldquo;{query}&rdquo;
          </p>
          <p className="mt-1 text-xs text-snomed-grey/50">
            Try different keywords or check your spelling.
          </p>
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <>
          <p className="mb-6 text-xs text-snomed-grey/50">
            {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
          </p>

          <div className="space-y-8">
            {files.length > 0 && (
              <ResultsGroup
                label="Documents"
                count={files.length}
                icon={<FileText size={14} />}
              >
                {files.map((r) => (
                  <FileResultRow key={r.data.id} result={r} />
                ))}
              </ResultsGroup>
            )}

            {archives.length > 0 && (
              <ResultsGroup
                label="Official Records"
                count={archives.length}
                icon={<Archive size={14} />}
              >
                {archives.map((r) => (
                  <FileResultRow key={r.data.id} result={r} />
                ))}
              </ResultsGroup>
            )}

            {events.length > 0 && (
              <ResultsGroup
                label="Meetings"
                count={events.length}
                icon={<Calendar size={14} />}
              >
                {events.map((r) => (
                  <EventResultRow key={r.data.id} result={r} />
                ))}
              </ResultsGroup>
            )}
          </div>
        </>
      )}
    </div>
  );
}
