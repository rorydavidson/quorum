import { type NextRequest, NextResponse } from 'next/server';

// BFF URL is only available server-side — NOT a NEXT_PUBLIC_ var
const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

// Proxied auth paths — only these are forwarded to the BFF
const ALLOWED_PATHS = ['login', 'callback', 'logout', 'session', 'refresh'];

async function proxyToBff(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);

  // Extract the route segments after /api/auth/
  const segments = url.pathname.replace(/^\/api\/auth\/?/, '').split('/').filter(Boolean);
  const path = segments[0];

  if (!path || !ALLOWED_PATHS.includes(path)) {
    return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  // Rebuild the BFF URL, preserving query params (needed for /callback?code=...&state=...)
  const bffUrl = new URL(`/auth/${path}`, BFF_URL);
  url.searchParams.forEach((value, key) => {
    bffUrl.searchParams.set(key, value);
  });

  const bffResponse = await fetch(bffUrl.toString(), {
    method: request.method,
    headers: {
      'cookie': request.headers.get('cookie') ?? '',
      'content-type': request.headers.get('content-type') ?? 'application/json',
    },
    body: request.method !== 'GET' && request.method !== 'HEAD'
      ? await request.text()
      : undefined,
    redirect: 'manual', // handle redirects manually so we can forward them
  });

  // The BFF sends redirects for /login, /callback, /logout
  if (bffResponse.status >= 300 && bffResponse.status < 400) {
    const location = bffResponse.headers.get('location') ?? '/';
    const response = NextResponse.redirect(location, { status: bffResponse.status });
    // Forward Set-Cookie headers (session cookie from BFF)
    forwardSetCookie(bffResponse, response);
    return response;
  }

  // Normal JSON response
  const body = await bffResponse.text();
  const response = new NextResponse(body, {
    status: bffResponse.status,
    headers: { 'content-type': bffResponse.headers.get('content-type') ?? 'application/json' },
  });
  forwardSetCookie(bffResponse, response);
  return response;
}

function forwardSetCookie(from: Response, to: NextResponse): void {
  // getSetCookie() correctly preserves multiple Set-Cookie headers
  // including those containing commas (like Expires=...) which can be
  // corrupted by standard .get() or .forEach()
  const setCookies = from.headers.getSetCookie();
  for (const cookie of setCookies) {
    to.headers.append('set-cookie', cookie);
  }
}

export const GET = proxyToBff;
export const POST = proxyToBff;
