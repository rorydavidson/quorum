'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/common/ErrorState';

export default function SpaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[space] route error:', error);
  }, [error]);

  return (
    <ErrorState
      title="Couldn’t load this space"
      message="The documents or calendar for this space failed to load. This is usually temporary — please try again."
      onRetry={reset}
    />
  );
}
