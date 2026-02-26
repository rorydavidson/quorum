import { Issuer, generators, type Client, type TokenSet } from 'openid-client';
import type { SessionUser } from '@snomed/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const KEYCLOAK_URL    = process.env.KEYCLOAK_URL    ?? 'https://dev-snoauth.ihtsdotools.org';
const KEYCLOAK_REALM  = process.env.KEYCLOAK_REALM  ?? 'snomed';
const CLIENT_ID       = process.env.KEYCLOAK_CLIENT_ID     ?? 'quorum';
const CLIENT_SECRET   = process.env.KEYCLOAK_CLIENT_SECRET ?? '';
const REDIRECT_URI    = process.env.KEYCLOAK_REDIRECT_URI  ?? 'http://localhost:3001/auth/callback';

const DISCOVERY_URL = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`;

// ---------------------------------------------------------------------------
// Singleton client — initialised once at startup via init()
// ---------------------------------------------------------------------------

let _client: Client | null = null;
let _issuer: Issuer | null = null;

export async function initKeycloak(): Promise<void> {
  if (_client) return;
  _issuer = await Issuer.discover(DISCOVERY_URL);
  _client = new _issuer.Client({
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uris: [REDIRECT_URI],
    response_types: ['code'],
  });
  console.log(`[keycloak] Discovered issuer: ${_issuer.metadata.issuer}`);
}

function getClient(): Client {
  if (!_client) throw new Error('Keycloak client not initialised — call initKeycloak() first');
  return _client;
}

// ---------------------------------------------------------------------------
// Auth URL generation
// ---------------------------------------------------------------------------

export interface AuthParams {
  state: string;
  nonce: string;
  authorizationUrl: string;
}

export function buildAuthParams(): AuthParams {
  const state = generators.state();
  const nonce = generators.nonce();
  const authorizationUrl = getClient().authorizationUrl({
    scope: 'openid profile email',
    state,
    nonce,
  });
  return { state, nonce, authorizationUrl };
}

// ---------------------------------------------------------------------------
// Token exchange (authorization code → token set)
// ---------------------------------------------------------------------------

export async function exchangeCodeForTokens(
  callbackUrl: string,
  expectedState: string,
): Promise<TokenSet> {
  const client = getClient();
  const params = client.callbackParams(callbackUrl);
  const tokenSet = await client.callback(REDIRECT_URI, params, {
    state: expectedState,
  });
  return tokenSet;
}

// ---------------------------------------------------------------------------
// Parse ID token claims → SessionUser
// ---------------------------------------------------------------------------

export function parseIdToken(tokenSet: TokenSet): SessionUser {
  const claims = tokenSet.claims();

  // Keycloak puts groups in a custom claim — shape depends on realm mapper config.
  // Typical values: ["/board-members", "/secretariat"] or ["board-members"]
  const rawGroups = (claims['groups'] as string[] | undefined) ?? [];

  return {
    sub:         claims.sub,
    email:       (claims.email as string | undefined)       ?? '',
    name:        (claims.name as string | undefined)        ?? '',
    given_name:  (claims.given_name as string | undefined)  ?? '',
    family_name: (claims.family_name as string | undefined) ?? '',
    groups:      rawGroups,
  };
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return getClient().refresh(refreshToken);
}

// ---------------------------------------------------------------------------
// Logout URL
// ---------------------------------------------------------------------------

export function buildLogoutUrl(postLogoutRedirectUri: string): string {
  const issuer = _issuer;
  if (!issuer?.metadata.end_session_endpoint) {
    // Fallback if endpoint not advertised
    return postLogoutRedirectUri;
  }
  return `${issuer.metadata.end_session_endpoint}?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;
}
