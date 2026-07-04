// GET /api/notifications/subscriptions — the caller's subscribed space IDs.
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function GET() {
  const cookieStore = await cookies();
  const res = await fetch(`${BFF_URL}/notifications/subscriptions`, {
    headers: { cookie: cookieStore.toString() },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}
