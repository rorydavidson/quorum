// GET /api/admin/subscriptions — who has subscribed to notifications, per space.
import { bffGetHeaders } from '@/lib/bff';
import { NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function GET() {
  const res = await fetch(`${BFF_URL}/admin/subscriptions`, {
    headers: await bffGetHeaders(),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}
