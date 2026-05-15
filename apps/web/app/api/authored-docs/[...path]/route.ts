import { type NextRequest } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await params;
  const bffPath = `/authored-docs/${path.join('/')}`;
  const bffUrl = `${BFF_URL}${bffPath}${request.nextUrl.search}`;

  const forwardHeaders: Record<string, string> = {
    cookie: request.headers.get('cookie') ?? '',
  };

  const contentType = request.headers.get('content-type');
  if (contentType) {
    forwardHeaders['content-type'] = contentType;
  }

  const csrfToken = request.headers.get('x-csrf-token');
  if (csrfToken) {
    forwardHeaders['x-csrf-token'] = csrfToken;
  }

  const bffRes = await fetch(bffUrl, {
    method: request.method,
    headers: forwardHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'DELETE'
      ? request.body
      : undefined,
    // @ts-expect-error — duplex required for streaming bodies in Node 18+
    duplex: 'half',
  });

  const resContentType = bffRes.headers.get('content-type') ?? '';
  const resHeaders: HeadersInit = {};
  if (resContentType) resHeaders['content-type'] = resContentType;

  return new Response(bffRes.body, {
    status: bffRes.status,
    headers: resHeaders,
  });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
