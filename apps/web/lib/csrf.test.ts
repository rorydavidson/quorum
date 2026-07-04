import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// csrf.ts caches the token at module scope, so reset the module registry
// between tests to get a clean cache each time.
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const tokenResponse = () =>
  new Response(JSON.stringify({ token: 'tok-123' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('getCsrfToken', () => {
  it('fetches once and caches the token', async () => {
    const fetchFn = mockFetch(() => tokenResponse());
    const { getCsrfToken } = await import('./csrf');

    expect(await getCsrfToken()).toBe('tok-123');
    expect(await getCsrfToken()).toBe('tok-123');
    // Only the first call hits the network.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe('/api/csrf-token');
  });
});

describe('csrfFetch', () => {
  it('passes GET through without a token', async () => {
    const fetchFn = mockFetch((url) =>
      url === '/api/csrf-token' ? tokenResponse() : new Response('ok', { status: 200 }),
    );
    const { csrfFetch } = await import('./csrf');

    await csrfFetch('/api/documents/board', { method: 'GET' });
    // No token fetch for a safe method.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const headers = (fetchFn.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(headers['x-csrf-token']).toBeUndefined();
  });

  it('attaches x-csrf-token on unsafe methods', async () => {
    const fetchFn = mockFetch((url) =>
      url === '/api/csrf-token' ? tokenResponse() : new Response(null, { status: 204 }),
    );
    const { csrfFetch } = await import('./csrf');

    const res = await csrfFetch('/api/documents/board/f1/read', { method: 'POST' });
    expect(res.status).toBe(204);
    const call = fetchFn.mock.calls.find((c) => c[0] !== '/api/csrf-token')!;
    const headers = (call[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['x-csrf-token']).toBe('tok-123');
  });

  it('refreshes the token and retries once on a CSRF 403', async () => {
    let tokenCalls = 0;
    let postCalls = 0;
    const fetchFn = mockFetch((url) => {
      if (url === '/api/csrf-token') {
        tokenCalls += 1;
        return new Response(JSON.stringify({ token: `tok-${tokenCalls}` }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      postCalls += 1;
      if (postCalls === 1) {
        return new Response(JSON.stringify({ code: 'CSRF_INVALID' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 204 });
    });
    const { csrfFetch } = await import('./csrf');

    const res = await csrfFetch('/api/admin/spaces', { method: 'POST' });
    expect(res.status).toBe(204);
    // First token, then a refreshed token after the 403.
    expect(tokenCalls).toBe(2);
    expect(postCalls).toBe(2);
    const lastPost = fetchFn.mock.calls.filter((c) => c[0] !== '/api/csrf-token').at(-1)!;
    const headers = (lastPost[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['x-csrf-token']).toBe('tok-2');
  });
});
