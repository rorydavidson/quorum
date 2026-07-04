// GET  /api/admin/categories — list all categories with sort orders (merged with spaces)
// PUT  /api/admin/categories — bulk-save category sort orders
import { NextRequest, NextResponse } from 'next/server';
import { bffHeaders } from '@/lib/bff';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

async function bffProxy(method: string, body?: unknown) {
  const res = await fetch(`${BFF_URL}/admin/categories`, {
    method,
    headers: await bffHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}

export async function GET() {
  return bffProxy('GET');
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  return bffProxy('PUT', body);
}
