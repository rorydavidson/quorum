import { NextRequest, NextResponse } from 'next/server';
import { bffHeaders } from '@/lib/bff';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest) {
    const body = await req.json();

    const res = await fetch(`${BFF_URL}/admin/import`, {
        method: 'POST',
        headers: await bffHeaders(),
        body: JSON.stringify(body),
    });

    if (res.status === 204) {
        return new NextResponse(null, { status: 204 });
    }

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return NextResponse.json(data, { status: res.status });
}
