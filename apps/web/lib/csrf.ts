/**
 * Client-side CSRF token handling.
 *
 * The BFF stores a per-session CSRF secret and requires it back as an
 * `x-csrf-token` header on POST/PUT/DELETE to /documents, /admin and /events
 * (Security Rule 11). The token is fetched once from the proxied
 * `GET /api/csrf-token`, cached in memory, and refreshed on a CSRF failure
 * (e.g. after the session rotates).
 */

let cachedToken: string | null = null;
let inflight: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  const res = await fetch('/api/csrf-token', { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Could not obtain a CSRF token');
  const { token } = (await res.json()) as { token?: string };
  if (!token) throw new Error('CSRF token missing from response');
  cachedToken = token;
  return token;
}

/** Returns a cached CSRF token, fetching one if needed. Pass force to refresh. */
export async function getCsrfToken(force = false): Promise<string> {
  if (cachedToken && !force) return cachedToken;
  if (!inflight) {
    inflight = fetchToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * fetch() wrapper that attaches the CSRF token on unsafe methods and retries
 * once with a fresh token if the BFF rejects it as invalid.
 */
export async function csrfFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return fetch(input, init);
  }

  const send = (token: string) =>
    fetch(input, {
      ...init,
      credentials: 'same-origin',
      headers: { ...(init.headers ?? {}), 'x-csrf-token': token },
    });

  let res = await send(await getCsrfToken());
  if (res.status === 403) {
    const body = await res
      .clone()
      .json()
      .catch(() => null as { code?: string } | null);
    if (body?.code === 'CSRF_INVALID') {
      res = await send(await getCsrfToken(true));
    }
  }
  return res;
}
