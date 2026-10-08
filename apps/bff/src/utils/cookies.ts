/**
 * Whether cookies set by the BFF (session and OIDC state/nonce) carry the
 * Secure flag.
 *
 * Secure by default in production. COOKIE_SECURE=false is an explicit opt-out
 * for running production builds over plain HTTP (e.g. local Docker without
 * TLS), where browsers would otherwise drop the cookies and break login.
 * An empty value counts as unset, since compose passes `${VAR:-}` through as "".
 */
export function isCookieSecure(): boolean {
  const flag = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "production";
}
