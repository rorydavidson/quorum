'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileText, Calendar, X, Archive, Loader2 } from 'lucide-react';
import type { SearchResult } from '@snomed/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanFileName(name: string): string {
  return name.replace(/^_OFFICIAL_RECORD_\d{4}-\d{2}-\d{2}_/, '');
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function resultHref(result: SearchResult): string {
  if (result.type === 'event') {
    return `/spaces/${result.data.spaceId}/calendar`;
  }
  return `/spaces/${result.spaceId}/documents`;
}

// ---------------------------------------------------------------------------
// ResultGroup sub-component
// ---------------------------------------------------------------------------

function ResultGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-50 text-[10px] font-semibold uppercase tracking-widest text-snomed-grey/40">
        {icon}
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultItem sub-component
// ---------------------------------------------------------------------------

function ResultItem({
  selected,
  onClick,
  onMouseEnter,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={[
        'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
        selected
          ? 'bg-snomed-blue-light text-snomed-blue'
          : 'text-snomed-grey hover:bg-gray-50',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SearchBar — the ⌘K command palette, mounted globally in Shell
// ---------------------------------------------------------------------------

export function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // ⌘K / Ctrl+K to open; Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input and reset state whenever the palette opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelectedIndex(-1);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounced search fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=10`);
        const data = (await res.json()) as SearchResult[];
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      router.push(resultHref(result));
      setOpen(false);
    },
    [router]
  );

  const navigateToSearch = useCallback(() => {
    const q = query.trim();
    if (q.length < 2) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
    setOpen(false);
  }, [query, router]);

  // Keyboard navigation within the input
  function handleKeyDownInInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        navigateToResult(results[selectedIndex]);
      } else {
        navigateToSearch();
      }
    }
  }

  // Group results by type
  const files = results.filter((r): r is Extract<SearchResult, { type: 'file' }> => r.type === 'file');
  const archives = results.filter((r): r is Extract<SearchResult, { type: 'archive' }> => r.type === 'archive');
  const events = results.filter((r): r is Extract<SearchResult, { type: 'event' }> => r.type === 'event');

  // Flat ordered list for keyboard nav index tracking
  const allResults = [...files, ...archives, ...events];
  const hasResults = results.length > 0;
  const showEmpty = query.trim().length >= 2 && !loading && !hasResults;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-x-0 top-[8vh] z-50 flex justify-center px-4"
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
      >
        <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden border border-snomed-border">

          {/* Search input row */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-snomed-border">
            {loading ? (
              <Loader2 size={18} className="flex-shrink-0 text-snomed-blue animate-spin" aria-hidden="true" />
            ) : (
              <Search size={18} className="flex-shrink-0 text-snomed-grey/40" aria-hidden="true" />
            )}
            <input
              ref={inputRef}
              type="text"
              placeholder="Search documents and meetings…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(-1);
              }}
              onKeyDown={handleKeyDownInInput}
              className="flex-1 bg-transparent text-sm text-snomed-grey placeholder:text-snomed-grey/40 outline-none min-w-0"
              aria-label="Search query"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={() => setOpen(false)}
              aria-label="Close search"
              className="flex-shrink-0 p-1 rounded text-snomed-grey/40 hover:text-snomed-grey/70 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Results panel */}
          {(hasResults || showEmpty) && (
            <div className="max-h-[55vh] overflow-y-auto divide-y divide-snomed-border">
              {showEmpty ? (
                <div className="px-4 py-8 text-center text-sm text-snomed-grey/50">
                  No results for &ldquo;{query}&rdquo;
                </div>
              ) : (
                <>
                  {files.length > 0 && (
                    <ResultGroup label="Documents" icon={<FileText size={12} />}>
                      {files.map((r) => (
                        <ResultItem
                          key={r.data.id}
                          selected={allResults.indexOf(r) === selectedIndex}
                          onClick={() => navigateToResult(r)}
                          onMouseEnter={() => setSelectedIndex(allResults.indexOf(r))}
                        >
                          <FileText size={14} className="flex-shrink-0 text-snomed-grey/40" aria-hidden="true" />
                          <span className="flex-1 truncate">{cleanFileName(r.data.name)}</span>
                          <span className="flex-shrink-0 text-[10px] text-snomed-grey/40">{r.spaceName}</span>
                        </ResultItem>
                      ))}
                    </ResultGroup>
                  )}

                  {archives.length > 0 && (
                    <ResultGroup label="Official Records" icon={<Archive size={12} />}>
                      {archives.map((r) => (
                        <ResultItem
                          key={r.data.id}
                          selected={allResults.indexOf(r) === selectedIndex}
                          onClick={() => navigateToResult(r)}
                          onMouseEnter={() => setSelectedIndex(allResults.indexOf(r))}
                        >
                          <Archive size={14} className="flex-shrink-0 text-amber-500" aria-hidden="true" />
                          <span className="flex-1 truncate">{cleanFileName(r.data.name)}</span>
                          <span className="flex-shrink-0 text-[10px] text-snomed-grey/40">{r.spaceName}</span>
                        </ResultItem>
                      ))}
                    </ResultGroup>
                  )}

                  {events.length > 0 && (
                    <ResultGroup label="Meetings" icon={<Calendar size={12} />}>
                      {events.map((r) => (
                        <ResultItem
                          key={r.data.id}
                          selected={allResults.indexOf(r) === selectedIndex}
                          onClick={() => navigateToResult(r)}
                          onMouseEnter={() => setSelectedIndex(allResults.indexOf(r))}
                        >
                          <Calendar size={14} className="flex-shrink-0 text-snomed-blue" aria-hidden="true" />
                          <span className="flex-1 truncate">{r.data.summary}</span>
                          <span className="flex-shrink-0 text-[10px] text-snomed-grey/40">
                            {formatEventDate(r.data.start)}
                          </span>
                        </ResultItem>
                      ))}
                    </ResultGroup>
                  )}
                </>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-snomed-border text-[11px] text-snomed-grey/50">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-white border border-snomed-border font-mono text-[10px]">↑↓</kbd>
              {' navigate · '}
              <kbd className="px-1 py-0.5 rounded bg-white border border-snomed-border font-mono text-[10px]">↵</kbd>
              {' open · '}
              <kbd className="px-1 py-0.5 rounded bg-white border border-snomed-border font-mono text-[10px]">Esc</kbd>
              {' close'}
            </span>
            {query.trim().length >= 2 && (
              <button
                onClick={navigateToSearch}
                className="text-snomed-blue hover:underline font-medium"
              >
                See all results →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
