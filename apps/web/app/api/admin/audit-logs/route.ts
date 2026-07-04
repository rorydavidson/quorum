import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    // Forward all filter/pagination params (action, entityType, user, from, to, limit, offset)
    const qs = req.nextUrl.search;

    const res = await fetch(`${BFF_URL}/admin/audit-logs${qs}`, {
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
