import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    const limit = req.nextUrl.searchParams.get('limit') ?? '100';

    const res = await fetch(`${BFF_URL}/admin/audit-logs?limit=${limit}`, {
        headers: {
            cookie: cookieStore.toString(),
        },
    });

    if (!res.ok) {
        const error = await res.json();
        return NextResponse.json(error, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
}
