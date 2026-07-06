import { cookies, headers } from 'next/headers';

/**
 * Headers common to every server-side proxy call to the BFF: the session
 * cookie and the real client IP (x-forwarded-for, set by nginx on the inbound
 * request) so BFF per-IP rate limits apply per user rather than per web
 * container.
 */
async function baseHeaders(): Promise<Record<string, string>> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const forwardedFor = headerStore.get('x-forwarded-for');
  return {
    cookie: cookieStore.toString(),
    ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
  };
}

/**
 * Headers for read-only proxy calls (GET) — cookie + client IP.
 */
export async function bffGetHeaders(): Promise<Record<string, string>> {
  return baseHeaders();
}

/**
 * Headers for state-changing proxy calls. Adds a JSON content type and
 * forwards the browser's `x-csrf-token` header when present so the BFF's
 * CSRF check passes.
 */
export async function bffHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const headerStore = await headers();
  const csrf = headerStore.get('x-csrf-token');
  return {
    'Content-Type': 'application/json',
    ...(await baseHeaders()),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
    ...extra,
  };
}
