// GET  /api/admin/categories — list all categories with sort orders (merged with spaces)
// PUT  /api/admin/categories — bulk-save category sort orders
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

async function bffProxy(method: string, cookie: string, body?: unknown) {
  const res = await fetch(`${BFF_URL}/admin/categories`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}

export async function GET() {
  const cookieStore = await cookies();
  return bffProxy('GET', cookieStore.toString());
}

export async function PUT(req: NextRequest) {
  const cookieStore = await cookies();
  const body = await req.json();
  return bffProxy('PUT', cookieStore.toString(), body);
}
