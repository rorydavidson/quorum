// POST /api/metrics/view — forward a page-view beacon to the BFF.
import { type NextRequest, NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const res = await fetch(`${BFF_URL}/metrics/view`, {
    method: 'POST',
    headers: {
      cookie: request.headers.get('cookie') ?? '',
      'content-type': 'application/json',
    },
    body,
  });
  return new NextResponse(null, { status: res.status });
}
