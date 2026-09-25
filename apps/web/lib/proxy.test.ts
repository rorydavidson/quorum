// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isProxiedPath, proxyToBff } from './proxy';

const fetchMock = vi.fn<typeof fetch>();

function bffResponse(
  body: string | null,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.headers ?? { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isProxiedPath', () => {
  it('allows the known BFF prefixes', () => {
    expect(isProxiedPath(['admin', 'spaces'])).toBe(true);
    expect(isProxiedPath(['documents', 'board', 'f1', 'download'])).toBe(true);
    expect(isProxiedPath(['csrf-token'])).toBe(true);
  });

  it('rejects anything not on the allowlist', () => {
    expect(isProxiedPath(['health'])).toBe(false);
    expect(isProxiedPath(['auth', 'login'])).toBe(false);
    expect(isProxiedPath([])).toBe(false);
  });
});

describe('proxyToBff', () => {
  it('forwards method, path, query string, cookie and CSRF header', async () => {
    fetchMock.mockResolvedValue(bffResponse('{"ok":true}'));

    const req = new NextRequest('http://localhost:3000/api/admin/audit-logs?action=DELETE_SPACE&limit=5', {
      headers: { cookie: 'quorum_session=abc', 'x-csrf-token': 'tok', 'x-forwarded-for': '1.2.3.4' },
    });
    const res = await proxyToBff(req, '/admin/audit-logs');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/admin/audit-logs?action=DELETE_SPACE&limit=5');
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe('GET');
    expect(headers.get('cookie')).toBe('quorum_session=abc');
    expect(headers.get('x-csrf-token')).toBe('tok');
    // Only the allowlisted headers travel to the BFF.
    expect(headers.get('x-forwarded-for')).toBeNull();
  });

  it('streams a request body with its content-type for mutating methods', async () => {
    fetchMock.mockResolvedValue(bffResponse('{"id":"board"}', { status: 201 }));

    const req = new NextRequest('http://localhost:3000/api/admin/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 's=1' },
      body: JSON.stringify({ id: 'board' }),
    });
    const res = await proxyToBff(req, '/admin/spaces');

    expect(res.status).toBe(201);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(init?.body).toBeDefined();
    expect((init as { duplex?: string }).duplex).toBe('half');
  });

  it('passes through a 204 with no body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const req = new NextRequest('http://localhost:3000/api/admin/spaces/board', { method: 'DELETE' });
    const res = await proxyToBff(req, '/admin/spaces/board');

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it('forwards content-type and content-disposition for downloads', async () => {
    fetchMock.mockResolvedValue(
      bffResponse('timestamp,user\r\n', {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="audit.csv"',
          'x-internal': 'secret',
        },
      }),
    );

    const req = new NextRequest('http://localhost:3000/api/admin/audit-logs/export');
    const res = await proxyToBff(req, '/admin/audit-logs/export');

    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="audit.csv"');
    expect(res.headers.get('x-internal')).toBeNull();
    expect(await res.text()).toBe('timestamp,user\r\n');
  });

  it('passes JSON error bodies through with their status', async () => {
    fetchMock.mockResolvedValue(
      bffResponse('{"error":"Access denied","code":"FORBIDDEN"}', { status: 403 }),
    );

    const req = new NextRequest('http://localhost:3000/api/documents/board');
    const res = await proxyToBff(req, '/documents/board');

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Access denied', code: 'FORBIDDEN' });
  });

  it('normalises a non-JSON error body to the standard error shape', async () => {
    fetchMock.mockResolvedValue(
      bffResponse('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const req = new NextRequest('http://localhost:3000/api/search?q=x');
    const res = await proxyToBff(req, '/search');

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Invalid response from BFF', code: 'BFF_UNAVAILABLE' });
  });
});
