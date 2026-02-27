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
// GET /auth/login
// Redirects to Keycloak authorize URL. Stores state in session.
// ---------------------------------------------------------------------------

router.get('/login', (req, res) => {
  const { state, nonce, authorizationUrl } = buildAuthParams();
  req.session.oauthState = state;
  req.session.oauthNonce = nonce;

  req.session.save((err) => {
    if (err) {
      console.error('[auth] Failed to save session before login redirect', err);
      res.status(500).json({ error: 'Session error', code: 'SESSION_ERROR' });
      return;
    }
    res.redirect(authorizationUrl);
  });
});

// ---------------------------------------------------------------------------
// GET /auth/callback
// Keycloak redirects here with ?code= and ?state=
// ---------------------------------------------------------------------------

router.get('/callback', asyncHandler(async (req, res) => {
  const expectedState = req.session.oauthState;
  const expectedNonce = req.session.oauthNonce;
  if (!expectedState || !expectedNonce) {
    res.status(400).json({ error: 'Missing OAuth state or nonce', code: 'INVALID_STATE' });
    return;
  }

  // Build full callback URL from the request
  const callbackUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  const tokenSet = await exchangeCodeForTokens(callbackUrl, expectedState, expectedNonce);
  const user = parseIdToken(tokenSet);

  // Store user and refresh token in session; clear OAuth state
  req.session.user = user;
  req.session.refreshToken = tokenSet.refresh_token ?? '';
  delete req.session.oauthState;
  delete req.session.oauthNonce;

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

  const tokenSet = await refreshTokens(req.session.refreshToken);
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
