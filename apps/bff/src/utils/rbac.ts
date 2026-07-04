/**
 * Centralised RBAC helpers.
 *
 * Keycloak group membership can arrive bare ("board-members") or path-prefixed
 * ("/board-members") depending on realm config, so all comparisons normalise
 * for a leading slash. These functions were previously copy-pasted across
 * documents/search/forum/calendar/events routes; keeping a single source of
 * truth avoids authorisation logic drifting between copies.
 */

export const ADMIN_GROUP = "portal_admin";

/** True if the user belongs to the portal admin group. */
export function isAdminUser(groups: string[]): boolean {
  return groups.some((g) => g === ADMIN_GROUP || g === `/${ADMIN_GROUP}`);
}

/**
 * True if the user can access a space's Keycloak group.
 * Admins always pass. Group comparison is slash-insensitive.
 */
export function userCanAccessSpace(
  userGroups: string[],
  spaceGroup: string,
  isAdmin = false,
): boolean {
  if (isAdmin) return true;
  return userGroups.some(
    (g) =>
      g === spaceGroup ||
      g === spaceGroup.replace(/^\//, "") ||
      `/${g}` === spaceGroup,
  );
}

/**
 * True if the user is permitted to upload/modify within a space.
 * Admins always pass; otherwise the user must be in one of the upload groups.
 */
export function userCanUpload(
  userGroups: string[],
  uploadGroups: string[],
  isAdmin = false,
): boolean {
  if (isAdmin) return true;
  return uploadGroups.some((g) =>
    userGroups.some(
      (ug) => ug === g || ug === g.replace(/^\//, "") || `/${ug}` === g,
    ),
  );
}
