export function userCanAccessSpace(
  userGroups: string[],
  spaceGroup: string,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  return userGroups.some(
    (g) =>
      g === spaceGroup ||
      g === spaceGroup.replace(/^\//, "") ||
      `/${g}` === spaceGroup,
  );
}

export function isAdminUser(groups: string[]): boolean {
  return groups.some((g) => g === "portal_admin" || g === "/portal_admin");
}

export function userCanUpload(
  userGroups: string[],
  uploadGroups: string[],
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  return uploadGroups.some((g) =>
    userGroups.some(
      (ug) => ug === g || ug === g.replace(/^\//, "") || `/${ug}` === g,
    ),
  );
}
