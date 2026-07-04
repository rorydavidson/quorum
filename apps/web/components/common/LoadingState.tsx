import { Loader2 } from 'lucide-react';

/**
 * Shared loading UI for route-segment `loading.tsx` files. Rendered as a
 * Suspense fallback while server components stream in.
 */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-24 text-center"
      role="status"
      aria-live="polite"
    >
      <Loader2 size={28} className="animate-spin text-snomed-blue" aria-hidden="true" />
      <p className="mt-3 text-sm text-snomed-grey/60">{label}</p>
    </div>
  );
}
