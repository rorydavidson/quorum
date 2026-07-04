'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Records a first-party page view on each portal navigation (including
 * client-side route changes). Fire-and-forget via sendBeacon so it never
 * blocks navigation or unload. Admin pages are excluded so config activity
 * doesn't skew usage stats.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    if (pathname.startsWith('/admin')) return;
    last.current = pathname;

    const body = JSON.stringify({ path: pathname });
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/metrics/view',
          new Blob([body], { type: 'application/json' }),
        );
      } else {
        void fetch('/api/metrics/view', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true,
        });
      }
    } catch {
      /* analytics is best-effort */
    }
  }, [pathname]);

  return null;
}
