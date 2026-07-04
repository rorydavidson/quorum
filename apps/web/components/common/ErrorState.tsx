'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  /** Short, human-readable heading. */
  title?: string;
  /** Optional detail line shown under the heading. */
  message?: string;
  /** When provided, renders a "Try again" button that calls it. */
  onRetry?: () => void;
}

/**
 * Shared error UI for route-segment error boundaries. Kept deliberately calm
 * and non-technical — board members on iPad shouldn't see raw stack traces.
 */
export function ErrorState({
  title = 'Something went wrong',
  message = 'We couldn’t load this page. Please try again in a moment.',
  onRetry,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <AlertTriangle size={28} aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-snomed-grey">{title}</p>
      <p className="mt-1 max-w-md text-sm text-snomed-grey/60">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-snomed-blue px-5 text-sm font-medium text-white transition-colors hover:bg-snomed-blue-dark"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}
