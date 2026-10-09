import 'express-session';
import type { SessionUser } from '@snomed/types';

declare module 'express-session' {
  interface SessionData {
    user: SessionUser;
    /** OIDC state param — stored during login, verified in callback */
    oauthState: string;
    /** OIDC nonce — stored during login, verified in callback */
    oauthNonce: string;
    /** Opaque refresh token — never sent to browser */
    refreshToken: string;
    /** Raw ID token, kept only as id_token_hint for Keycloak logout — never sent to browser */
    idToken: string;
    /** CSRF secret — generated per session, never sent to browser directly */
    _csrfSecret: string;
  }
}
