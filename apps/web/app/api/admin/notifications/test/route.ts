// POST /api/admin/notifications/test — send a test email to the calling admin.
import { NextResponse } from 'next/server';
import { bffHeaders } from '@/lib/bff';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function POST() {
  const res = await fetch(`${BFF_URL}/admin/notifications/test`, {
    method: 'POST',
    headers: await bffHeaders(),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: res.status });
}
