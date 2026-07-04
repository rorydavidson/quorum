'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/common/ErrorState';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] route error:', error);
  }, [error]);

  return (
    <ErrorState
      title="Admin page failed to load"
      message="Something went wrong loading the admin configuration. Please try again."
      onRetry={reset}
    />
  );
}
