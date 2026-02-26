import Knex from 'knex';
import type { SpaceConfig } from '@snomed/types';

// ---------------------------------------------------------------------------
// Knex instance
// ---------------------------------------------------------------------------

const db = Knex({
  client: 'better-sqlite3',
  connection: {
    filename: process.env.DATABASE_URL?.replace('file:', '') ?? './dev.db',
  },
  useNullAsDefault: true,
});

// ---------------------------------------------------------------------------
// Schema migration — runs at startup, idempotent
// ---------------------------------------------------------------------------

export async function runMigrations(): Promise<void> {
  const hasTable = await db.schema.hasTable('spaces');
  if (!hasTable) {
    await db.schema.createTable('spaces', (t) => {
      t.string('id').primary();
      t.string('name').notNullable();
      t.text('description').nullable();
      t.string('keycloak_group').notNullable();
      t.string('drive_folder_id').notNullable();
      t.string('calendar_id').nullable();
      t.string('hierarchy_category').notNullable().defaultTo('General');
      t.text('upload_groups').notNullable().defaultTo('[]'); // JSON array
      t.integer('sort_order').notNullable().defaultTo(0);
    });
    console.log('[db] Created spaces table');
  }
}

// ---------------------------------------------------------------------------
// Row <-> domain type conversion
// ---------------------------------------------------------------------------

interface SpaceRow {
  id: string;
  name: string;
  description: string | null;
  keycloak_group: string;
  drive_folder_id: string;
  calendar_id: string | null;
  hierarchy_category: string;
  upload_groups: string; // JSON
  sort_order: number;
}

function rowToSpace(row: SpaceRow): SpaceConfig {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    keycloakGroup: row.keycloak_group,
    driveFolderId: row.drive_folder_id,
    calendarId: row.calendar_id ?? undefined,
    hierarchyCategory: row.hierarchy_category,
    uploadGroups: JSON.parse(row.upload_groups) as string[],
    sortOrder: row.sort_order,
  };
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

export async function getSpaces(): Promise<SpaceConfig[]> {
  const rows = await db<SpaceRow>('spaces').orderBy('sort_order').orderBy('name');
  return rows.map(rowToSpace);
}

export async function getSpaceById(id: string): Promise<SpaceConfig | undefined> {
  const row = await db<SpaceRow>('spaces').where({ id }).first();
  return row ? rowToSpace(row) : undefined;
}

/** Returns only the spaces whose keycloak_group is in the provided groups array. */
export async function getSpacesByGroups(groups: string[]): Promise<SpaceConfig[]> {
  if (groups.length === 0) return [];
  const rows = await db<SpaceRow>('spaces')
    .whereIn('keycloak_group', groups)
    .orderBy('sort_order')
    .orderBy('name');
  return rows.map(rowToSpace);
}

export async function upsertSpace(
  id: string,
  payload: Omit<SpaceConfig, 'id'>
): Promise<SpaceConfig> {
  const row: SpaceRow = {
    id,
    name: payload.name,
    description: payload.description ?? null,
    keycloak_group: payload.keycloakGroup,
    drive_folder_id: payload.driveFolderId,
    calendar_id: payload.calendarId ?? null,
    hierarchy_category: payload.hierarchyCategory,
    upload_groups: JSON.stringify(payload.uploadGroups),
    sort_order: payload.sortOrder,
  };

  const existing = await db<SpaceRow>('spaces').where({ id }).first();
  if (existing) {
    await db<SpaceRow>('spaces').where({ id }).update(row);
  } else {
    await db<SpaceRow>('spaces').insert(row);
  }

  return rowToSpace(row);
}

export async function deleteSpace(id: string): Promise<void> {
  await db<SpaceRow>('spaces').where({ id }).delete();
}

export default db;
