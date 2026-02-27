import Knex from 'knex';
import { SpaceConfig, SpaceSection, EventMetadata, AuditLog } from '@snomed/types';

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
  const hasSpaces = await db.schema.hasTable('spaces');
  if (!hasSpaces) {
    await db.schema.createTable('spaces', (t) => {
      t.string('id').primary();
      t.string('name').notNullable();
      t.text('description').nullable();
      t.string('keycloak_group').notNullable();
      t.string('drive_folder_id').notNullable();
      t.string('calendar_id').nullable();
      t.string('ical_url').nullable();
      t.string('hierarchy_category').notNullable().defaultTo('General');
      t.text('upload_groups').notNullable().defaultTo('[]'); // JSON array
      t.integer('sort_order').notNullable().defaultTo(0);
    });
    console.log('[db] Created spaces table');
  }

  // Idempotent column migration: add ical_url if it doesn't exist (existing DBs)
  const hasIcalUrl = await db.schema.hasColumn('spaces', 'ical_url');
  if (!hasIcalUrl) {
    await db.schema.alterTable('spaces', (t) => {
      t.string('ical_url').nullable();
    });
    console.log('[db] Added ical_url column to spaces table');
  }

  const hasSections = await db.schema.hasTable('space_sections');
  if (!hasSections) {
    await db.schema.createTable('space_sections', (t) => {
      t.string('id').notNullable();
      t.string('space_id').notNullable().references('id').inTable('spaces').onDelete('CASCADE');
      t.string('name').notNullable();
      t.text('description').nullable();
      t.string('drive_folder_id').notNullable();
      t.integer('sort_order').notNullable().defaultTo(0);
      t.primary(['id', 'space_id']);
    });
    console.log('[db] Created space_sections table');
  }

  const hasEventMetadata = await db.schema.hasTable('event_metadata');
  if (!hasEventMetadata) {
    await db.schema.createTable('event_metadata', (t) => {
      t.string('id').primary(); // event_id
      t.string('space_id').notNullable().references('id').inTable('spaces').onDelete('CASCADE');
      t.string('google_doc_url').nullable();
      t.text('agenda_items').notNullable().defaultTo('[]'); // JSON
    });
    console.log('[db] Created event_metadata table');
  }

  const hasAuditLogs = await db.schema.hasTable('audit_logs');
  if (!hasAuditLogs) {
    await db.schema.createTable('audit_logs', (t) => {
      t.increments('id').primary();
      t.timestamp('timestamp').notNullable().defaultTo(db.fn.now());
      t.string('user_id').notNullable();
      t.string('user_name').notNullable();
      t.string('action').notNullable();
      t.string('entity_type').notNullable();
      t.string('entity_id').notNullable();
      t.text('details').nullable(); // JSON
    });
    console.log('[db] Created audit_logs table');
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
  ical_url: string | null;
  hierarchy_category: string;
  upload_groups: string; // JSON
  sort_order: number;
}

interface SectionRow {
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
  const rows = await db<SpaceRow>('spaces').orderBy('sort_order').orderBy('name');
  const sectionRows = await db<SectionRow>('space_sections').orderBy('sort_order');
  const sectionsBySpace: Record<string, SpaceSection[]> = {};
  for (const s of sectionRows) {
    if (!sectionsBySpace[s.space_id]) sectionsBySpace[s.space_id] = [];
    sectionsBySpace[s.space_id].push(rowToSection(s));
  }
  return rows.map((r) => rowToSpace(r, sectionsBySpace[r.id] ?? []));
}

export async function getSpaceById(id: string): Promise<SpaceConfig | undefined> {
  const row = await db<SpaceRow>('spaces').where({ id }).first();
  if (!row) return undefined;
  const sectionRows = await db<SectionRow>('space_sections')
    .where({ space_id: id })
    .orderBy('sort_order');
  return rowToSpace(row, sectionRows.map(rowToSection));
}

/** Returns only the spaces whose keycloak_group is in the provided groups array. */
export async function getSpacesByGroups(groups: string[]): Promise<SpaceConfig[]> {
  if (groups.length === 0) return [];
  const rows = await db<SpaceRow>('spaces')
    .whereIn('keycloak_group', groups)
    .orderBy('sort_order')
    .orderBy('name');
  const ids = rows.map((r) => r.id);
  const sectionRows = ids.length
    ? await db<SectionRow>('space_sections').whereIn('space_id', ids).orderBy('sort_order')
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
  payload: Omit<SpaceConfig, 'id' | 'sections'>
): Promise<SpaceConfig> {
  const row: SpaceRow = {
    id,
    name: payload.name,
    description: payload.description ?? null,
    keycloak_group: payload.keycloakGroup,
    drive_folder_id: payload.driveFolderId,
    calendar_id: payload.calendarId ?? null,
    ical_url: payload.icalUrl ?? null,
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

  return rowToSpace(row, []);
}

export async function deleteSpace(id: string): Promise<void> {
  await db<SpaceRow>('spaces').where({ id }).delete();
}

// ---------------------------------------------------------------------------
// CRUD — Space sections
// ---------------------------------------------------------------------------

export async function upsertSection(
  spaceId: string,
  sectionId: string,
  payload: Omit<SpaceSection, 'id'>
): Promise<SpaceSection> {
  const row: SectionRow = {
    id: sectionId,
    space_id: spaceId,
    name: payload.name,
    description: payload.description ?? null,
    drive_folder_id: payload.driveFolderId,
    sort_order: payload.sortOrder,
  };

  const existing = await db<SectionRow>('space_sections')
    .where({ id: sectionId, space_id: spaceId })
    .first();
  if (existing) {
    await db<SectionRow>('space_sections').where({ id: sectionId, space_id: spaceId }).update(row);
  } else {
    await db<SectionRow>('space_sections').insert(row);
  }
  return rowToSection(row);
}

export async function deleteSection(spaceId: string, sectionId: string): Promise<void> {
  await db<SectionRow>('space_sections').where({ id: sectionId, space_id: spaceId }).delete();
}

export async function getSectionById(
  spaceId: string,
  sectionId: string
): Promise<SpaceSection | undefined> {
  const row = await db<SectionRow>('space_sections')
    .where({ id: sectionId, space_id: spaceId })
    .first();
  return row ? rowToSection(row) : undefined;
}

// ---------------------------------------------------------------------------
// CRUD — Event Metadata
// ---------------------------------------------------------------------------

interface EventMetadataRow {
  id: string;
  space_id: string;
  google_doc_url: string | null;
  agenda_items: string; // JSON
}

function rowToEventMetadata(row: EventMetadataRow): EventMetadata {
  return {
    id: row.id,
    spaceId: row.space_id,
    googleDocUrl: row.google_doc_url ?? undefined,
    agendaItems: JSON.parse(row.agenda_items),
  };
}

export async function getEventMetadata(id: string): Promise<EventMetadata | undefined> {
  const row = await db<EventMetadataRow>('event_metadata').where({ id }).first();
  return row ? rowToEventMetadata(row) : undefined;
}

export async function upsertEventMetadata(
  id: string,
  spaceId: string,
  payload: Partial<Omit<EventMetadata, 'id' | 'spaceId'>>
): Promise<EventMetadata> {
  const existing = await db<EventMetadataRow>('event_metadata').where({ id }).first();

  const rowToInsert: Partial<EventMetadataRow> = {
    id,
    space_id: spaceId,
  };

  if (payload.googleDocUrl !== undefined) {
    rowToInsert.google_doc_url = payload.googleDocUrl ?? null;
  }
  if (payload.agendaItems !== undefined) {
    rowToInsert.agenda_items = JSON.stringify(payload.agendaItems);
  }

  if (existing) {
    await db<EventMetadataRow>('event_metadata').where({ id }).update(rowToInsert);
  } else {
    // If inserting new, ensuring defaults
    if (rowToInsert.agenda_items === undefined) rowToInsert.agenda_items = '[]';
    await db<EventMetadataRow>('event_metadata').insert(rowToInsert as EventMetadataRow);
  }

  const updated = await getEventMetadata(id);
  return updated!;
}

// ---------------------------------------------------------------------------
// Backup & Restore
// ---------------------------------------------------------------------------

export interface SiteBackup {
  version: number;
  timestamp: string;
  spaces: SpaceConfig[];
}

export async function getBackup(): Promise<SiteBackup> {
  const spaces = await getSpaces();
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    spaces,
  };
}

export async function restoreBackup(backup: SiteBackup): Promise<void> {
  await db.transaction(async (trx) => {
    // 1. Clear existing data
    await trx('space_sections').delete();
    await trx('spaces').delete();

    // 2. Insert spaces and sections
    for (const space of backup.spaces) {
      const spaceRow: SpaceRow = {
        id: space.id,
        name: space.name,
        description: space.description ?? null,
        keycloak_group: space.keycloakGroup,
        drive_folder_id: space.driveFolderId,
        calendar_id: space.calendarId ?? null,
        ical_url: space.icalUrl ?? null,
        hierarchy_category: space.hierarchyCategory,
        upload_groups: JSON.stringify(space.uploadGroups),
        sort_order: space.sortOrder,
      };
      await trx('spaces').insert(spaceRow);

      for (const section of space.sections) {
        const sectionRow: SectionRow = {
          id: section.id,
          space_id: space.id,
          name: section.name,
          description: section.description ?? null,
          drive_folder_id: section.driveFolderId,
          sort_order: section.sortOrder,
        };
        await trx('space_sections').insert(sectionRow);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

export async function createAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
  await db('audit_logs').insert({
    user_id: log.userId,
    user_name: log.userName,
    action: log.action,
    entity_type: log.entityType,
    entity_id: log.entityId,
    details: log.details,
  });
}

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  const rows = await db('audit_logs')
    .orderBy('timestamp', 'desc')
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    userId: r.user_id,
    userName: r.user_name,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    details: r.details,
  }));
}

export default db;
