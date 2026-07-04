// POST /api/admin/spaces/:spaceId/files/:fileId/snapshot
//   → BFF POST /admin/spaces/:spaceId/files/:fileId/snapshot
//
// Creates an Official Record copy of a single document.
// Body: { fileName: string }
import { NextRequest, NextResponse } from 'next/server';
import { bffHeaders } from '@/lib/bff';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

interface Params { params: Promise<{ spaceId: string; fileId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { spaceId, fileId } = await params;
  const body = await req.text();

  const res = await fetch(
    `${BFF_URL}/admin/spaces/${spaceId}/files/${fileId}/snapshot`,
    {
      method: 'POST',
      headers: await bffHeaders(),
      body,
    },
  );

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}
