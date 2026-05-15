import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const CSRF_HEADER = "x-csrf-token";
const CSRF_SESSION_KEY = "_csrfSecret";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function csrfToken(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session[CSRF_SESSION_KEY]) {
    req.session[CSRF_SESSION_KEY] = generateToken();
  }
  next();
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const sessionToken = req.session[CSRF_SESSION_KEY];
  const headerToken = req.headers[CSRF_HEADER];

  if (!sessionToken || !headerToken || sessionToken !== headerToken) {
    res.status(403).json({ error: "Invalid or missing CSRF token", code: "CSRF_INVALID" });
    return;
  }

  next();
}
