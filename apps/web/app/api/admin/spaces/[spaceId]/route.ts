// GET /api/admin/spaces/:id
// PUT /api/admin/spaces/:id
// DELETE /api/admin/spaces/:id
import { NextRequest, NextResponse } from 'next/server';
import { bffHeaders } from '@/lib/bff';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

async function bffProxy(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BFF_URL}${path}`, {
    method,
    headers: await bffHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}

interface Params { params: Promise<{ spaceId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { spaceId } = await params;
  return bffProxy('GET', `/admin/spaces/${spaceId}`);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { spaceId } = await params;
  const body = await req.json();
  return bffProxy('PUT', `/admin/spaces/${spaceId}`, body);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { spaceId } = await params;
  return bffProxy('DELETE', `/admin/spaces/${spaceId}`);
}
