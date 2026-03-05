import { Router, type IRouter } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  buildAuthParams,
  exchangeCodeForTokens,
  parseIdToken,
  refreshTokens,
  buildLogoutUrl,
} from '../services/keycloak.js';

const router: IRouter = Router();

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// OAuth state cookie settings.
//
// We store the OIDC state and nonce in short-lived httpOnly cookies rather
// than in the express-session because:
//
//  • Next.js App Router emits concurrent RSC prefetch requests. When the
//    middleware detects no session it redirects ALL of them to /auth/login.
//    Each concurrent hit used to overwrite req.session.oauthState with a
//    fresh value — so by the time Keycloak returned the callback the session
//    held a DIFFERENT state → "Missing OAuth state or nonce" (INVALID_STATE).
//
//  • Cookies are independent per-response Set-Cookie headers; the browser
//    applies the last one received before following any redirect, so the
//    cookie always reflects the state that produced the final Keycloak URL.
//
//  • Idempotency (below) ensures all concurrent login requests agree on the
//    same state, eliminating the race entirely.
//
// sameSite:'lax' is intentional: the browser sends lax cookies on top-level
// cross-site GET redirects (Keycloak → our callback), which is exactly how
// the OIDC Authorization Code flow works.
// ---------------------------------------------------------------------------

const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

const OAUTH_COOKIE_OPTS = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/auth',          // only sent to /auth/* routes
  maxAge: 10 * 60 * 1000, // 10 minutes — plenty of time for any login flow
} as const;

// ---------------------------------------------------------------------------
// Helper: read a single named cookie from the raw Cookie request header.
// Avoids pulling in the cookie-parser package for just two cookie names.
// ---------------------------------------------------------------------------

function getCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(';')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    if (pair.slice(0, eqIdx).trim() === name) {
      return decodeURIComponent(pair.slice(eqIdx + 1).trim());
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// GET /auth/login
// Redirects to Keycloak authorize URL.
//
// Idempotent: if state/nonce cookies already exist (set by a concurrent RSC
// prefetch that arrived a few milliseconds earlier), reuse them so that every
// parallel call produces the exact same Keycloak URL.  The real browser
// navigation will receive the last Set-Cookie before following the redirect to
// Keycloak, so the callback always finds a matching cookie.
// ---------------------------------------------------------------------------

router.get('/login', (req, res) => {
  const existingState = getCookie(req.headers.cookie, 'oauth_state');
  const existingNonce = getCookie(req.headers.cookie, 'oauth_nonce');

  // If valid cookies already exist, buildAuthParams reuses them (idempotent).
  // If not, fresh cryptographically-random values are generated.
  const { state, nonce, authorizationUrl } = buildAuthParams(existingState, existingNonce);

  res.cookie('oauth_state', state, OAUTH_COOKIE_OPTS);
  res.cookie('oauth_nonce', nonce, OAUTH_COOKIE_OPTS);
  res.redirect(authorizationUrl);
});

// ---------------------------------------------------------------------------
// GET /auth/callback
// Keycloak redirects here with ?code= and ?state=
// ---------------------------------------------------------------------------

router.get('/callback', asyncHandler(async (req, res) => {
  const expectedState = getCookie(req.headers.cookie, 'oauth_state');
  const expectedNonce = getCookie(req.headers.cookie, 'oauth_nonce');

  if (!expectedState || !expectedNonce) {
    console.error('[auth] Callback arrived without oauth_state / oauth_nonce cookies — ' +
      'browser may have blocked cookies or the 10-minute login window expired');
    res.status(400).json({ error: 'Missing OAuth state or nonce', code: 'INVALID_STATE' });
    return;
  }

  // Clear the one-time state cookies immediately (they're single-use)
  const clearOpts = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax' as const,
    path: '/auth',
  };
  res.clearCookie('oauth_state', clearOpts);
  res.clearCookie('oauth_nonce', clearOpts);

  // Build full callback URL from the request
  const callbackUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  let tokenSet: Awaited<ReturnType<typeof exchangeCodeForTokens>>;
  try {
    tokenSet = await exchangeCodeForTokens(callbackUrl, expectedState, expectedNonce);
  } catch (err) {
    console.error('[auth] Token exchange failed:', err);
    res.status(500).json({ error: 'Authentication failed', code: 'AUTH_ERROR' });
    return;
  }
  const user = parseIdToken(tokenSet);

  // Store user and refresh token in session
  req.session.user = user;
  req.session.refreshToken = tokenSet.refresh_token ?? '';

  req.session.save((err) => {
    if (err) {
      console.error('[auth] Failed to save session after callback', err);
      res.status(500).json({ error: 'Session error', code: 'SESSION_ERROR' });
      return;
    }
    res.redirect(`${FRONTEND_ORIGIN}/dashboard`);
  });
}));

// ---------------------------------------------------------------------------
// GET /auth/logout
// Clears session and redirects to Keycloak end_session_endpoint.
// ---------------------------------------------------------------------------

router.get('/logout', (req, res) => {
  const postLogoutUri = FRONTEND_ORIGIN;
  const logoutUrl = buildLogoutUrl(postLogoutUri);

  req.session.destroy((err) => {
    if (err) console.error('[auth] Session destroy error on logout:', err);
    res.clearCookie(process.env.SESSION_COOKIE_NAME ?? 'quorum_session');
    res.redirect(logoutUrl);
  });
});

// ---------------------------------------------------------------------------
// GET /auth/session
// Returns current user from session (no tokens). 401 if not authenticated.
// Called by Next.js middleware on every portal request.
// ---------------------------------------------------------------------------

router.get('/session', (req, res) => {
  if (!req.session.user) {
    res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHENTICATED' });
    return;
  }
  res.json({ user: req.session.user });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh  (optional — called if access token expiry matters)
// ---------------------------------------------------------------------------

router.post('/refresh', asyncHandler(async (req, res) => {
  if (!req.session.user || !req.session.refreshToken) {
    res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHENTICATED' });
    return;
  }

  let tokenSet: Awaited<ReturnType<typeof refreshTokens>>;
  try {
    tokenSet = await refreshTokens(req.session.refreshToken);
  } catch (err) {
    console.error('[auth] Token refresh failed:', err);
    res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    return;
  }
  const user = parseIdToken(tokenSet);
  req.session.user = user;
  req.session.refreshToken = tokenSet.refresh_token ?? req.session.refreshToken;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: 'Session error', code: 'SESSION_ERROR' });
      return;
    }
    res.json({ user: req.session.user });
  });
}));

export default router;
