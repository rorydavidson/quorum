import { NextResponse } from 'next/server';
import { bffHeaders } from '@/lib/bff';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function POST() {
    const res = await fetch(`${BFF_URL}/admin/reset`, {
        method: 'POST',
        headers: await bffHeaders(),
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to reset site' }));
        return NextResponse.json(error, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
}
