// Split out of the former single services/db.ts. Import via services/db.js (barrel).
import type { SpaceConfig, SpaceSection } from "@snomed/types";
import db from "./client.js";

// ---------------------------------------------------------------------------
// Row <-> domain type conversion
// ---------------------------------------------------------------------------

export interface SpaceRow {
  id: string;
  name: string;
  description: string | null;
  keycloak_group: string;
  drive_folder_id: string;
  calendar_id: string | null;
  ical_url: string | null;
  discourse_category_slug: string | null;
  hierarchy_category: string;
  upload_groups: string; // JSON
  sort_order: number;
}

export interface SectionRow {
  id: string;
  space_id: string;
  name: string;
  description: string | null;
  drive_folder_id: string;
  sort_order: number;
}

function rowToSection(row: SectionRow): SpaceSection {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    driveFolderId: row.drive_folder_id,
    sortOrder: row.sort_order,
  };
}

function rowToSpace(row: SpaceRow, sections: SpaceSection[] = []): SpaceConfig {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    keycloakGroup: row.keycloak_group,
    driveFolderId: row.drive_folder_id,
    calendarId: row.calendar_id ?? undefined,
    icalUrl: row.ical_url ?? undefined,
    discourseCategorySlug: row.discourse_category_slug ?? undefined,
    hierarchyCategory: row.hierarchy_category,
    uploadGroups: JSON.parse(row.upload_groups) as string[],
    sortOrder: row.sort_order,
    sections,
  };
}

// ---------------------------------------------------------------------------
// CRUD — Spaces
// ---------------------------------------------------------------------------

export async function getSpaces(): Promise<SpaceConfig[]> {
  const rows = await db<SpaceRow>("spaces")
    .orderBy("sort_order")
    .orderBy("name");
  const sectionRows =
    await db<SectionRow>("space_sections").orderBy("sort_order");
  const sectionsBySpace: Record<string, SpaceSection[]> = {};
  for (const s of sectionRows) {
    if (!sectionsBySpace[s.space_id]) sectionsBySpace[s.space_id] = [];
    sectionsBySpace[s.space_id].push(rowToSection(s));
  }
  return rows.map((r) => rowToSpace(r, sectionsBySpace[r.id] ?? []));
}

export async function getSpaceById(
  id: string,
): Promise<SpaceConfig | undefined> {
  const row = await db<SpaceRow>("spaces").where({ id }).first();
  if (!row) return undefined;
  const sectionRows = await db<SectionRow>("space_sections")
    .where({ space_id: id })
    .orderBy("sort_order");
  return rowToSpace(row, sectionRows.map(rowToSection));
}

/** Returns only the spaces whose keycloak_group is in the provided groups array. */
export async function getSpacesByGroups(
  groups: string[],
): Promise<SpaceConfig[]> {
  if (groups.length === 0) return [];
  const rows = await db<SpaceRow>("spaces")
    .whereIn("keycloak_group", groups)
    .orderBy("sort_order")
    .orderBy("name");
  const ids = rows.map((r) => r.id);
  const sectionRows = ids.length
    ? await db<SectionRow>("space_sections")
        .whereIn("space_id", ids)
        .orderBy("sort_order")
    : [];
  const sectionsBySpace: Record<string, SpaceSection[]> = {};
  for (const s of sectionRows) {
    if (!sectionsBySpace[s.space_id]) sectionsBySpace[s.space_id] = [];
    sectionsBySpace[s.space_id].push(rowToSection(s));
  }
  return rows.map((r) => rowToSpace(r, sectionsBySpace[r.id] ?? []));
}

export async function upsertSpace(
  id: string,
  payload: Omit<SpaceConfig, "id" | "sections">,
): Promise<SpaceConfig> {
  const row: SpaceRow = {
    id,
    name: payload.name,
    description: payload.description ?? null,
    keycloak_group: payload.keycloakGroup,
    drive_folder_id: payload.driveFolderId,
    calendar_id: payload.calendarId ?? null,
    ical_url: payload.icalUrl ?? null,
    discourse_category_slug: payload.discourseCategorySlug ?? null,
    hierarchy_category: payload.hierarchyCategory,
    upload_groups: JSON.stringify(payload.uploadGroups),
    sort_order: payload.sortOrder,
  };

  const existing = await db<SpaceRow>("spaces").where({ id }).first();
  if (existing) {
    await db<SpaceRow>("spaces").where({ id }).update(row);
  } else {
    await db<SpaceRow>("spaces").insert(row);
  }

  return rowToSpace(row, []);
}

export async function deleteSpace(id: string): Promise<void> {
  await db<SpaceRow>("spaces").where({ id }).delete();
}

// ---------------------------------------------------------------------------
// CRUD — Space sections
// ---------------------------------------------------------------------------

export async function upsertSection(
  spaceId: string,
  sectionId: string,
  payload: Omit<SpaceSection, "id">,
): Promise<SpaceSection> {
  const row: SectionRow = {
    id: sectionId,
    space_id: spaceId,
    name: payload.name,
    description: payload.description ?? null,
    drive_folder_id: payload.driveFolderId,
    sort_order: payload.sortOrder,
  };

  const existing = await db<SectionRow>("space_sections")
    .where({ id: sectionId, space_id: spaceId })
    .first();
  if (existing) {
    await db<SectionRow>("space_sections")
      .where({ id: sectionId, space_id: spaceId })
      .update(row);
  } else {
    await db<SectionRow>("space_sections").insert(row);
  }
  return rowToSection(row);
}

export async function deleteSection(
  spaceId: string,
  sectionId: string,
): Promise<void> {
  await db<SectionRow>("space_sections")
    .where({ id: sectionId, space_id: spaceId })
    .delete();
}

export async function getSectionById(
  spaceId: string,
  sectionId: string,
): Promise<SpaceSection | undefined> {
  const row = await db<SectionRow>("space_sections")
    .where({ id: sectionId, space_id: spaceId })
    .first();
  return row ? rowToSection(row) : undefined;
}

