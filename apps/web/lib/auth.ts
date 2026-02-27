import { headers } from 'next/headers';
import type { SessionUser } from '@snomed/types';

/**
 * Returns the current user from the request headers set by middleware.
 * Call this in Server Components and Route Handlers within the (portal) group.
 * Returns null if the header is missing (should not happen inside protected routes).
 */
export async function getUser(): Promise<SessionUser | null> {
  const headerStore = await headers();
  const raw = headerStore.get('x-quorum-user');
  if (!raw) return null;
  try {
    // Header is Base64 encoded by middleware to safely handle Unicode
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(decoded) as SessionUser;
  } catch {
    return null;
  }
}

/**
 * Returns true if the current user belongs to the portal_admin group.
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  return user.groups.some((g) => g === 'portal_admin' || g === '/portal_admin');
}
