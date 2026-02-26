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
  expectedNonce: string,
): Promise<TokenSet> {
  const client = getClient();
  const params = client.callbackParams(callbackUrl);
  const tokenSet = await client.callback(REDIRECT_URI, params, {
    state: expectedState,
    nonce: expectedNonce,
  });
  return tokenSet;
}

// ---------------------------------------------------------------------------
// Parse ID token claims → SessionUser
// ---------------------------------------------------------------------------

/**
 * Decode a JWT payload without re-verifying the signature.
 * Safe here because the token was just validated by openid-client during
 * the authorization code exchange — we only need the extra claims.
 */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function parseIdToken(tokenSet: TokenSet): SessionUser {
  const claims = tokenSet.claims();

  // 1. Realm groups — populated by a Keycloak "Group Membership" mapper.
  //    Typical values: ["/board-members", "secretariat"]
  const idGroups = (claims['groups'] as string[] | undefined) ?? [];

  // 2. Client roles — in Keycloak, client-specific roles live in the ACCESS token
  //    under resource_access.{clientId}.roles, NOT in the ID token groups claim.
  //    Decode the access token payload (already verified; safe to read claims).
  const accessPayload = tokenSet.access_token
    ? decodeJwtPayload(tokenSet.access_token)
    : {};

  const resourceAccess = accessPayload['resource_access'] as
    | Record<string, { roles?: string[] }>
    | undefined;
  const clientRoles = resourceAccess?.[CLIENT_ID]?.roles ?? [];

  // NOTE: We intentionally do NOT include realm_access.roles here.
  // Those are Keycloak's internal system roles (offline_access, uma_authorization,
  // composite admin roles, etc.) and must not be used for portal RBAC.
  // Only realm GROUP membership (idGroups) and quorum client roles (clientRoles) are relevant.

  // Merge and de-duplicate
  const groups = [...new Set([...idGroups, ...clientRoles])];

  return {
    sub:         claims.sub,
    email:       (claims.email as string | undefined)       ?? '',
    name:        (claims.name as string | undefined)        ?? '',
    given_name:  (claims.given_name as string | undefined)  ?? '',
    family_name: (claims.family_name as string | undefined) ?? '',
    groups,
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
