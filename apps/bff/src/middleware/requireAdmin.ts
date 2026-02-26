import type { Request, Response, NextFunction } from 'express';

const ADMIN_GROUP = 'portal_admin';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return;
  }
  // Groups may be stored with or without a leading slash (Keycloak varies by config)
  const isAdmin = user.groups.some(
    (g) => g === ADMIN_GROUP || g === `/${ADMIN_GROUP}`,
  );
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    return;
  }
  next();
}
