// GET /api/csrf-token — proxies the BFF's per-session CSRF token to the client.
import { bffGetHeaders } from '@/lib/bff';
import { NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function GET() {
  const res = await fetch(`${BFF_URL}/csrf-token`, {
    headers: await bffGetHeaders(),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}
