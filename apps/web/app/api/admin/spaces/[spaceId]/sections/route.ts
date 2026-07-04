// POST /api/admin/spaces/:spaceId/sections — create a section
import { NextRequest, NextResponse } from 'next/server';
import { bffHeaders } from '@/lib/bff';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

interface Params { params: Promise<{ spaceId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { spaceId } = await params;
  const body = await req.json();
  const res = await fetch(`${BFF_URL}/admin/spaces/${spaceId}/sections`, {
    method: 'POST',
    headers: await bffHeaders(),
    body: JSON.stringify(body),
  });
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}
