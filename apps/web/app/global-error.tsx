'use client';

import { useEffect } from 'react';

/**
 * Root error boundary. Catches errors thrown in the root layout itself, so it
 * must render its own <html>/<body>. Deliberately dependency-free (no shared
 * component imports) since the app shell may have failed to load.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global] fatal error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          background: '#F5F6F7',
          color: '#4D5057',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: '1.5rem',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            Quorum is temporarily unavailable
          </h1>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', opacity: 0.7 }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              minHeight: '44px',
              padding: '0 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#009FE3',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
