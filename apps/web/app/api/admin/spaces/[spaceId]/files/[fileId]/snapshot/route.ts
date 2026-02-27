// POST /api/admin/spaces/:spaceId/files/:fileId/snapshot
//   → BFF POST /admin/spaces/:spaceId/files/:fileId/snapshot
//
// Creates an Official Record copy of a single document.
// Body: { fileName: string }
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

interface Params { params: Promise<{ spaceId: string; fileId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { spaceId, fileId } = await params;
  const cookieStore = await cookies();
  const body = await req.text();

  const res = await fetch(
    `${BFF_URL}/admin/spaces/${spaceId}/files/${fileId}/snapshot`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookieStore.toString(),
      },
      body,
    },
  );

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}
