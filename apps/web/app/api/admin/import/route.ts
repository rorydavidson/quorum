import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const cookie = cookieStore.toString();
    const body = await req.json();

    const res = await fetch(`${BFF_URL}/admin/import`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            cookie,
        },
        body: JSON.stringify(body),
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return NextResponse.json(data, { status: res.status });
}
