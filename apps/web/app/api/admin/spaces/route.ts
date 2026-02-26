// GET /api/admin/spaces  — list all spaces
// POST /api/admin/spaces — create a space
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

export async function GET() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  return bffProxy('GET', '/admin/spaces', cookie);
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  const body = await req.json();
  return bffProxy('POST', '/admin/spaces', cookie, body);
}
