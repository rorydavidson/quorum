// GET /api/admin/audit-logs/export — proxy the BFF CSV export, preserving filters.
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const qs = req.nextUrl.search;

  const res = await fetch(`${BFF_URL}/admin/audit-logs/export${qs}`, {
    headers: { cookie: cookieStore.toString() },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Export failed' }));
    return NextResponse.json(error, { status: res.status });
  }

  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'text/csv; charset=utf-8',
      'content-disposition':
        res.headers.get('content-disposition') ?? 'attachment; filename="quorum-audit-log.csv"',
    },
  });
}
