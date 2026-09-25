import type { NextRequest } from 'next/server';
import { isProxiedPath, proxyToBff } from '@/lib/proxy';

/**
 * Generic BFF proxy: /api/<prefix>/... → BFF /<prefix>/...
 *
 * Every portal API call except /api/auth/* goes through here. The BFF owns
 * authentication, authorisation, CSRF and validation; this layer only exists
 * so the browser talks to a single origin and the BFF URL and session cookie
 * never leave the server. /api/auth/* has a dedicated handler because it
 * must forward redirects and Set-Cookie headers.
 */
async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  if (!isProxiedPath(path)) {
    return Response.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }
  return proxyToBff(request, `/${path.map(encodeURIComponent).join('/')}`);
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
