import type { Request, Response, NextFunction } from 'express';

const DEV_USER = {
  sub: 'dev-user',
  email: 'dev@example.com',
  name: 'Dev User',
  given_name: 'Dev',
  family_name: 'User',
  groups: ['portal_admin'],
};

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Dev bypass — inject a fake session user so all downstream route logic works normally
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH_BYPASS === 'true') {
    req.session.user = DEV_USER;
    next();
    return;
  }

  if (!req.session.user) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return;
  }
  next();
}
