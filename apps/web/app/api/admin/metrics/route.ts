// GET /api/admin/metrics — proxy the BFF usage-metrics bundle (admin only).
import { bffGetHeaders } from '@/lib/bff';
import { NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function GET() {
  const res = await fetch(`${BFF_URL}/admin/metrics`, {
    headers: await bffGetHeaders(),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to load metrics' }));
    return NextResponse.json(error, { status: res.status });
  }
  const data = await res.json();
  return NextResponse.json(data);
}
