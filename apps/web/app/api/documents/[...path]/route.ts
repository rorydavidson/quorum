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

  // Build forwarded headers — always include cookie for auth
  const forwardHeaders: Record<string, string> = {
    cookie: request.headers.get('cookie') ?? '',
  };

  // For POST (file upload), forward the Content-Type so multer sees the multipart boundary
  const contentType = request.headers.get('content-type');
  if (contentType) {
    forwardHeaders['content-type'] = contentType;
  }

  const bffRes = await fetch(bffUrl, {
    method: request.method,
    headers: forwardHeaders,
    // Forward body for POST/PUT/PATCH; GET/HEAD/DELETE have no body
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    // Required so Next.js doesn't buffer the streaming multipart body before forwarding
    // @ts-expect-error — duplex is required for streaming bodies in Node 18+
    duplex: 'half',
  });

  // Propagate response headers relevant to content type / disposition
  const resContentType = bffRes.headers.get('content-type') ?? '';
  const resContentDisposition = bffRes.headers.get('content-disposition') ?? '';

  const resHeaders: HeadersInit = {};
  if (resContentType) resHeaders['content-type'] = resContentType;
  if (resContentDisposition) resHeaders['content-disposition'] = resContentDisposition;

  return new Response(bffRes.body, {
    status: bffRes.status,
    headers: resHeaders,
  });
}

export { handler as GET, handler as POST, handler as DELETE };
