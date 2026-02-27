// PUT /api/admin/spaces/:spaceId/sections/:sectionId
// DELETE /api/admin/spaces/:spaceId/sections/:sectionId
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

interface Params { params: Promise<{ spaceId: string; sectionId: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const { spaceId, sectionId } = await params;
  const cookieStore = await cookies();
  const body = await req.json();
  const res = await fetch(`${BFF_URL}/admin/spaces/${spaceId}/sections/${sectionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie: cookieStore.toString() },
    body: JSON.stringify(body),
  });

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { spaceId, sectionId } = await params;
  const cookieStore = await cookies();
  const res = await fetch(`${BFF_URL}/admin/spaces/${spaceId}/sections/${sectionId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', cookie: cookieStore.toString() },
  });

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}
