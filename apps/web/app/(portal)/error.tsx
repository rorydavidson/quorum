'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/common/ErrorState';

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[portal] route error:', error);
  }, [error]);

  return <ErrorState onRetry={reset} />;
}
