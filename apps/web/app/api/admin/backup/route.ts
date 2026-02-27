import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function GET() {
    const cookieStore = await cookies();
    const cookie = cookieStore.toString();

    const res = await fetch(`${BFF_URL}/admin/backup`, {
        headers: { cookie },
    });

    if (!res.ok) {
        return NextResponse.json({ error: 'Failed to fetch backup' }, { status: res.status });
    }

    const backup = await res.json();
    return NextResponse.json(backup);
}
