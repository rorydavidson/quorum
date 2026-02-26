import { type NextRequest, NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

/**
 * Proxy GET /api/calendar to BFF /calendar.
 * Forwards session cookie and any query parameters (?limit=&days=).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const bffUrl = `${BFF_URL}/calendar${request.nextUrl.search}`;

  const bffRes = await fetch(bffUrl, {
    headers: {
      cookie: request.headers.get('cookie') ?? '',
    },
  });

  const data = await bffRes.json().catch(() => ({ error: 'Invalid response from BFF' }));
  return NextResponse.json(data, { status: bffRes.status });
}
