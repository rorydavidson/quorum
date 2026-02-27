import { type NextRequest, NextResponse } from "next/server";

const BFF_URL = process.env.BFF_URL ?? "http://localhost:3001";

async function proxyToBff(
    request: NextRequest,
    { params }: { params: Promise<{ spaceId: string; eventId: string }> }
): Promise<NextResponse> {
    const { spaceId, eventId } = await params;
    const url = `${BFF_URL}/events/${spaceId}/${eventId}`;

    const bffResponse = await fetch(url, {
        method: request.method,
        headers: {
            cookie: request.headers.get("cookie") ?? "",
            "content-type": "application/json",
        },
        body: request.method !== "GET" && request.method !== "HEAD"
            ? await request.text()
            : undefined,
    });

    const data = await bffResponse.json();
    return NextResponse.json(data, { status: bffResponse.status });
}

export const GET = proxyToBff;
export const POST = proxyToBff;
