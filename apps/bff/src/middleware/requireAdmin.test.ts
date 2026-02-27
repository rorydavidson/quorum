import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAdmin } from './requireAdmin.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(user?: { groups: string[] }): Request {
  return {
    session: user ? { user: { sub: 'u1', email: 'u@test.com', name: 'User', ...user } } : {},
  } as unknown as Request;
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

describe('requireAdmin middleware', () => {
  it('returns 401 when no session user', () => {
    const req = makeReq(); // session.user is undefined
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user has no groups', () => {
    const req = makeReq({ groups: [] });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden', code: 'FORBIDDEN' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user has unrelated groups', () => {
    const req = makeReq({ groups: ['board-members', 'secretariat'] });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when user has portal_admin group (without slash)', () => {
    const req = makeReq({ groups: ['portal_admin'] });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when user has /portal_admin group (with leading slash — Keycloak path format)', () => {
    const req = makeReq({ groups: ['/portal_admin'] });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when portal_admin is one of several groups', () => {
    const req = makeReq({ groups: ['board-members', 'portal_admin', 'secretariat'] });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
