import { type NextRequest, NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

/**
 * Proxy all /api/documents/* requests to the BFF /documents/* endpoint.
 * Forwards the session cookie so BFF can authenticate and authorise the request.
 * Streams the response directly — handles both JSON listings and binary file downloads.
 */
async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse | Response> {
  const { path } = await params;
  const bffPath = `/documents/${path.join('/')}`;
  const bffUrl = `${BFF_URL}${bffPath}${request.nextUrl.search}`;

  const bffRes = await fetch(bffUrl, {
    method: request.method,
    headers: {
      cookie: request.headers.get('cookie') ?? '',
    },
  });

  // For file downloads (binary), stream the body directly
  const contentType = bffRes.headers.get('content-type') ?? '';
  const contentDisposition = bffRes.headers.get('content-disposition') ?? '';

  const headers: HeadersInit = {};
  if (contentType) headers['content-type'] = contentType;
  if (contentDisposition) headers['content-disposition'] = contentDisposition;

  return new Response(bffRes.body, {
    status: bffRes.status,
    headers,
  });
}

export { handler as GET };
