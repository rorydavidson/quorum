'use client';

import { useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';

interface SearchInputProps {
  defaultValue?: string;
}

/**
 * Client-side search input for the /search results page.
 * Navigates to /search?q=… on Enter or clear.
 */
export function SearchInput({ defaultValue = '' }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Auto-focus on mount (desktop only via pointer media query logic is tricky;
  // just focus without causing scroll issues)
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = inputRef.current?.value.trim() ?? '';
      if (q.length >= 2) {
        startTransition(() => {
          router.push(`/search?q=${encodeURIComponent(q)}`);
        });
      }
    }
    if (e.key === 'Escape') {
      inputRef.current?.blur();
    }
  }

  function handleClear() {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
    startTransition(() => {
      router.push('/search');
    });
  }

  return (
    <div className="relative flex items-center">
      {isPending ? (
        <Loader2
          size={18}
          className="absolute left-3 text-snomed-blue animate-spin pointer-events-none"
          aria-hidden="true"
        />
      ) : (
        <Search
          size={18}
          className="absolute left-3 text-snomed-grey/40 pointer-events-none"
          aria-hidden="true"
        />
      )}
      <input
        ref={inputRef}
        type="text"
        defaultValue={defaultValue}
        placeholder="Search documents and meetings…"
        onKeyDown={handleKeyDown}
        className="w-full pl-10 pr-10 py-3 text-sm text-snomed-grey placeholder:text-snomed-grey/40 bg-white border border-snomed-border rounded-xl outline-none focus:ring-2 focus:ring-snomed-blue/30 focus:border-snomed-blue transition-colors shadow-sm"
        aria-label="Search query"
        autoComplete="off"
        spellCheck={false}
      />
      {defaultValue && (
        <button
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-3 p-1 rounded text-snomed-grey/40 hover:text-snomed-grey/70 transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
