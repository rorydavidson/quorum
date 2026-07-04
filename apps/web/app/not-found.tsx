import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-snomed-blue-light text-snomed-blue">
        <FileQuestion size={28} aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-snomed-grey">Page not found</p>
      <p className="mt-1 max-w-md text-sm text-snomed-grey/60">
        The page you’re looking for doesn’t exist or may have moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex min-h-[44px] items-center rounded-lg bg-snomed-blue px-5 text-sm font-medium text-white transition-colors hover:bg-snomed-blue-dark"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
