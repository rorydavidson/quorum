// GET /api/admin/spaces/:id
// PUT /api/admin/spaces/:id
// DELETE /api/admin/spaces/:id
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

async function bffProxy(method: string, path: string, cookie: string, body?: unknown) {
  const res = await fetch(`${BFF_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}

interface Params { params: Promise<{ spaceId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { spaceId } = await params;
  const cookieStore = await cookies();
  return bffProxy('GET', `/admin/spaces/${spaceId}`, cookieStore.toString());
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { spaceId } = await params;
  const cookieStore = await cookies();
  const body = await req.json();
  return bffProxy('PUT', `/admin/spaces/${spaceId}`, cookieStore.toString(), body);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { spaceId } = await params;
  const cookieStore = await cookies();
  return bffProxy('DELETE', `/admin/spaces/${spaceId}`, cookieStore.toString());
}
