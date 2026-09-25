import type { NextRequest } from 'next/server';

// Server-side only — never exposed as NEXT_PUBLIC_.
const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

/**
 * BFF path prefixes the generic /api/[...path] route is allowed to forward.
 * Anything else is a 404 at the Next.js layer, so a new BFF route is not
 * reachable from the browser until it is deliberately listed here.
 * /auth has its own handler (redirect + Set-Cookie forwarding).
 */
export const PROXIED_PREFIXES = [
  'admin',
  'calendar',
  'csrf-token',
  'documents',
  'events',
  'forum',
  'metrics',
  'notifications',
  'search',
] as const;

export function isProxiedPath(segments: readonly string[]): boolean {
  const [first] = segments;
  return first !== undefined && (PROXIED_PREFIXES as readonly string[]).includes(first);
}

/** Browser request headers forwarded verbatim to the BFF. */
const FORWARDED_REQUEST_HEADERS = ['cookie', 'content-type', 'x-csrf-token', 'accept'] as const;

/** BFF response headers forwarded verbatim to the browser. */
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'cache-control'] as const;

const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

/**
 * Forward a browser request to the BFF and stream the response back.
 *
 * - The session cookie and CSRF header travel with the request so the BFF can
 *   authenticate and authorise it; nothing else from the browser is trusted.
 * - Query strings are preserved (filters, pagination, search terms).
 * - Request and response bodies are streamed, so this handles JSON, multipart
 *   uploads, CSV exports and binary downloads alike.
 * - A non-JSON error body (nginx HTML, empty 502) is replaced with the
 *   standard `{ error, code }` shape so client code can always call res.json().
 */
export async function proxyToBff(request: NextRequest, bffPath: string): Promise<Response> {
  const url = `${BFF_URL}${bffPath}${request.nextUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    // Never follow a redirect from the BFF: hand the status back as-is.
    redirect: 'manual',
  };
  if (!BODYLESS_METHODS.has(request.method) && request.body) {
    init.body = request.body;
    // Required by Node's fetch when the body is a stream.
    init.duplex = 'half';
  }

  const bffRes = await fetch(url, init);

  if (bffRes.status === 204 || bffRes.status === 304) {
    return new Response(null, { status: bffRes.status });
  }

  const contentType = bffRes.headers.get('content-type') ?? '';
  if (!bffRes.ok && !contentType.includes('application/json')) {
    return Response.json(
      { error: 'Invalid response from BFF', code: 'BFF_UNAVAILABLE' },
      { status: bffRes.status },
    );
  }

  const resHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = bffRes.headers.get(name);
    if (value) resHeaders.set(name, value);
  }

  return new Response(bffRes.body, { status: bffRes.status, headers: resHeaders });
}
