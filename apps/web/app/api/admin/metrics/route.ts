// GET /api/admin/metrics — proxy the BFF usage-metrics bundle (admin only).
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function GET() {
  const cookieStore = await cookies();
  const res = await fetch(`${BFF_URL}/admin/metrics`, {
    headers: { cookie: cookieStore.toString() },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to load metrics' }));
    return NextResponse.json(error, { status: res.status });
  }
  const data = await res.json();
  return NextResponse.json(data);
}
