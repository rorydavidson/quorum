// POST/DELETE /api/notifications/subscriptions/:spaceId — subscribe / unsubscribe.
import { NextRequest, NextResponse } from 'next/server';
import { bffHeaders } from '@/lib/bff';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

interface Params { params: Promise<{ spaceId: string }> }

async function proxy(method: string, spaceId: string) {
  const res = await fetch(`${BFF_URL}/notifications/subscriptions/${spaceId}`, {
    method,
    headers: await bffHeaders(),
  });

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { spaceId } = await params;
  return proxy('POST', spaceId);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { spaceId } = await params;
  return proxy('DELETE', spaceId);
}
