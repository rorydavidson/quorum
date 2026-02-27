import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from './requireAuth.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(sessionUser?: unknown): Request {
  return { session: sessionUser !== undefined ? { user: sessionUser } : {} } as unknown as Request;
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & typeof res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requireAuth middleware', () => {
  afterEach(() => {
    delete process.env.DEV_AUTH_BYPASS;
    process.env.NODE_ENV = 'test';
  });

  it('calls next() when session.user is present', () => {
    const req = makeReq({ sub: 'u1', email: 'u@test.com', groups: [] });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when session has no user', () => {
    const req = makeReq(); // no user in session
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('injects dev user and calls next() when DEV_AUTH_BYPASS=true in non-production', () => {
    process.env.DEV_AUTH_BYPASS = 'true';
    process.env.NODE_ENV = 'development';

    const req = makeReq(); // no user — bypass should inject one
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as any).session.user).toBeDefined();
    expect((req as any).session.user.email).toBe('dev@example.com');
    expect((req as any).session.user.groups).toContain('portal_admin');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does NOT bypass authentication in production even with DEV_AUTH_BYPASS=true', () => {
    process.env.DEV_AUTH_BYPASS = 'true';
    process.env.NODE_ENV = 'production';

    const req = makeReq(); // no user
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT bypass when DEV_AUTH_BYPASS is absent', () => {
    // DEV_AUTH_BYPASS not set
    process.env.NODE_ENV = 'development';

    const req = makeReq(); // no user
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
