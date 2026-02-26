import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Phase 2: this middleware will call BFF /auth/session and redirect to
// /api/auth/login if the session is missing.
// For Phase 1 we just pass through so the dev server boots cleanly.

export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all portal routes, exclude Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|snomed-logo.png).*)',
  ],
};
