import { cookies, headers } from 'next/headers';

/**
 * Builds the headers used when a Next.js API route proxies to the BFF.
 * Always forwards the session cookie; forwards the browser's `x-csrf-token`
 * header when present so the BFF's CSRF check passes on state-changing routes.
 */
export async function bffHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const csrf = headerStore.get('x-csrf-token');
  return {
    'Content-Type': 'application/json',
    cookie: cookieStore.toString(),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
    ...extra,
  };
}
