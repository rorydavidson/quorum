import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Dev auth bypass — set DEV_AUTH_BYPASS=true in .env.local to skip Keycloak.
// Never active when NODE_ENV=production.
// ---------------------------------------------------------------------------
const DEV_USER = JSON.stringify({
  sub: 'dev-user',
  email: 'dev@example.com',
  name: 'Dev User',
  given_name: 'Dev',
  family_name: 'User',
  groups: ['portal_admin'],
});

// Routes that are publicly accessible without a session
const PUBLIC_PATHS = [
  '/api/auth',   // auth proxy routes — must be reachable to initiate login
  '/favicon.ico',
  '/snomed-logo.png',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Dev bypass — inject a fake admin user without hitting the BFF or Keycloak
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH_BYPASS === 'true') {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-quorum-user', DEV_USER);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Check session with BFF — forward the session cookie so BFF can read it
  let sessionOk = false;
  let userHeader: string | undefined;

  try {
    const sessionRes = await fetch(`${BFF_URL}/auth/session`, {
      headers: {
        // Forward all cookies (session cookie lives here)
        cookie: request.headers.get('cookie') ?? '',
      },
      // Edge runtime doesn't support keepAlive — plain fetch is fine
    });

    if (sessionRes.ok) {
      const body = await sessionRes.json() as { user: Record<string, unknown> };
      sessionOk = true;
      userHeader = JSON.stringify(body.user);
    }
  } catch (err) {
    // BFF unreachable — fail open in dev, fail closed in prod
    if (process.env.NODE_ENV === 'production') {
      console.error('[middleware] BFF unreachable:', err);
    }
  }

  if (!sessionOk) {
    // Redirect to the BFF login endpoint via the Next.js auth proxy
    const loginUrl = new URL('/api/auth/login', request.url);
    // Preserve the original destination so we can redirect back after login
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Session valid — pass the user as a REQUEST header so server components can read it
  // via `headers()` from 'next/headers' without making another BFF call.
  // IMPORTANT: Must use NextResponse.next({ request: { headers } }) — setting headers
  // on the *response* object sends them to the browser, not to server components.
  const requestHeaders = new Headers(request.headers);
  if (userHeader) {
    requestHeaders.set('x-quorum-user', userHeader);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     *  - _next/static  (static files)
     *  - _next/image   (image optimisation)
     *  - favicon.ico, snomed-logo.png (public assets)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|snomed-logo\\.png).*)',
  ],
};
