// GET /api/admin/spaces  — list all spaces
// POST /api/admin/spaces — create a space
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

export async function GET() {
  return bffProxy('GET', '/admin/spaces');
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return bffProxy('POST', '/admin/spaces', body);
}
