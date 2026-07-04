import Knex from "knex";
import {
  SpaceConfig,
  SpaceSection,
  EventMetadata,
  AuditLog,
  HierarchyCategoryConfig,
  DocumentReader,
  Activity,
  ActivityType,
  NotificationSubscription,
} from "@snomed/types";

// ---------------------------------------------------------------------------
// Knex instance — dynamic client selection
//
// PostgreSQL: DATABASE_URL starts with postgresql:// or postgres://
// SQLite:     anything else (default: file:./dev.db)
// ---------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";

export const isPostgresDb =
  databaseUrl.startsWith("postgresql://") ||
  databaseUrl.startsWith("postgres://");

const db = isPostgresDb
  ? Knex({
      client: "pg",
      connection: databaseUrl,
      pool: {
        min: 2,
        max: parseInt(process.env.DB_POOL_MAX ?? "25", 10) || 25,
      },
    })
  : Knex({
      client: "better-sqlite3",
      connection: {
        filename: databaseUrl.replace(/^file:/, "") || "./dev.db",
      },
      useNullAsDefault: true,
    });

// ---------------------------------------------------------------------------
// Schema migration — runs at startup, idempotent
// ---------------------------------------------------------------------------

export async function runMigrations(): Promise<void> {
  const hasSpaces = await db.schema.hasTable("spaces");
  if (!hasSpaces) {
    await db.schema.createTable("spaces", (t) => {
      t.string("id").primary();
      t.string("name").notNullable();
      t.text("description").nullable();
      t.string("keycloak_group").notNullable();
      t.string("drive_folder_id").notNullable();
      t.string("calendar_id").nullable();
      t.string("ical_url").nullable();
      t.string("hierarchy_category").notNullable().defaultTo("General");
      t.text("upload_groups").notNullable().defaultTo("[]"); // JSON array
      t.integer("sort_order").notNullable().defaultTo(0);
    });
    console.log("[db] Created spaces table");
  }

  // Idempotent column migration: add ical_url if it doesn't exist (existing DBs)
  const hasIcalUrl = await db.schema.hasColumn("spaces", "ical_url");
  if (!hasIcalUrl) {
    await db.schema.alterTable("spaces", (t) => {
      t.string("ical_url").nullable();
    });
    console.log("[db] Added ical_url column to spaces table");
  }

  // Idempotent column migration: add discourse_category_slug if it doesn't exist
  const hasDiscourseSlug = await db.schema.hasColumn(
    "spaces",
    "discourse_category_slug",
  );
  if (!hasDiscourseSlug) {
    await db.schema.alterTable("spaces", (t) => {
      t.string("discourse_category_slug").nullable();
    });
    console.log("[db] Added discourse_category_slug column to spaces table");
  }

  const hasSections = await db.schema.hasTable("space_sections");
  if (!hasSections) {
    await db.schema.createTable("space_sections", (t) => {
      t.string("id").notNullable();
      t.string("space_id")
        .notNullable()
        .references("id")
        .inTable("spaces")
        .onDelete("CASCADE");
      t.string("name").notNullable();
      t.text("description").nullable();
      t.string("drive_folder_id").notNullable();
      t.integer("sort_order").notNullable().defaultTo(0);
      t.primary(["id", "space_id"]);
    });
    console.log("[db] Created space_sections table");
  }

  const hasEventMetadata = await db.schema.hasTable("event_metadata");
  if (!hasEventMetadata) {
    await db.schema.createTable("event_metadata", (t) => {
      t.string("id").primary(); // event_id
      t.string("space_id")
        .notNullable()
        .references("id")
        .inTable("spaces")
        .onDelete("CASCADE");
      t.string("google_doc_url").nullable();
      t.text("agenda_items").notNullable().defaultTo("[]"); // JSON
    });
    console.log("[db] Created event_metadata table");
  }

  const hasAuditLogs = await db.schema.hasTable("audit_logs");
  if (!hasAuditLogs) {
    await db.schema.createTable("audit_logs", (t) => {
      t.increments("id").primary();
      t.timestamp("timestamp").notNullable().defaultTo(db.fn.now());
      t.string("user_id").notNullable();
      t.string("user_name").notNullable();
      t.string("action").notNullable();
      t.string("entity_type").notNullable();
      t.string("entity_id").notNullable();
      t.text("details").nullable(); // JSON
    });
    console.log("[db] Created audit_logs table");
  }

  const hasCategoryConfigs = await db.schema.hasTable("hierarchy_category_configs");
  if (!hasCategoryConfigs) {
    await db.schema.createTable("hierarchy_category_configs", (t) => {
      t.string("name").primary();
      t.integer("sort_order").notNullable().defaultTo(0);
    });
    console.log("[db] Created hierarchy_category_configs table");
  }

  const hasDocumentReads = await db.schema.hasTable("document_reads");
  if (!hasDocumentReads) {
    await db.schema.createTable("document_reads", (t) => {
      t.string("file_id").notNullable();
      t.string("space_id").notNullable();
      t.string("user_id").notNullable();
      t.string("user_name").notNullable();
      t.timestamp("read_at").notNullable().defaultTo(db.fn.now());
      t.primary(["file_id", "user_id"]);
      t.index(["space_id", "user_id"]); // fast "my reads in this space" lookups
    });
    console.log("[db] Created document_reads table");
  }

  // Notifiable events within a space. Kept as a durable log and used to build
  // email bodies when fanning out to subscribers.
  const hasActivities = await db.schema.hasTable("activities");
  if (!hasActivities) {
    await db.schema.createTable("activities", (t) => {
      t.increments("id").primary();
      t.string("space_id").notNullable();
      t.string("type").notNullable();
      t.string("title").notNullable();
      t.string("link").nullable();
      t.string("entity_id").nullable();
      t.string("actor_name").nullable();
      t.timestamp("created_at").notNullable().defaultTo(db.fn.now());
      t.index(["space_id", "created_at"]);
    });
    console.log("[db] Created activities table");
  }

  // Opt-in "Notify me" subscriptions. The email is captured from the user's
  // session at subscribe time, since there is no external user directory.
  const hasSubs = await db.schema.hasTable("notification_subscriptions");
  if (!hasSubs) {
    await db.schema.createTable("notification_subscriptions", (t) => {
      t.string("user_id").notNullable();
      t.string("space_id").notNullable();
      t.string("email").notNullable();
      t.timestamp("created_at").notNullable().defaultTo(db.fn.now());
      t.primary(["user_id", "space_id"]);
      t.index(["space_id"]); // fast subscriber lookup on fan-out
    });
    console.log("[db] Created notification_subscriptions table");
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
  discourse_category_slug: string | null;
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

export async function getEventMetadata(
  id: string,
): Promise<EventMetadata | undefined> {
  const row = await db<EventMetadataRow>("event_metadata")
    .where({ id })
    .first();
  return row ? rowToEventMetadata(row) : undefined;
}

export async function upsertEventMetadata(
  id: string,
  spaceId: string,
  payload: Partial<Omit<EventMetadata, "id" | "spaceId">>,
): Promise<EventMetadata> {
  const existing = await db<EventMetadataRow>("event_metadata")
    .where({ id })
    .first();

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
    await db<EventMetadataRow>("event_metadata")
      .where({ id })
      .update(rowToInsert);
  } else {
    // If inserting new, ensuring defaults
    if (rowToInsert.agenda_items === undefined) rowToInsert.agenda_items = "[]";
    await db<EventMetadataRow>("event_metadata").insert(
      rowToInsert as EventMetadataRow,
    );
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
  eventMetadata: EventMetadata[];
  categoryConfigs?: HierarchyCategoryConfig[];
}

export async function getBackup(): Promise<SiteBackup> {
  const spaces = await getSpaces();
  const eventMetadataRows = await db<EventMetadataRow>("event_metadata");
  const eventMetadata = eventMetadataRows.map(rowToEventMetadata);
  const categoryConfigs = await getCategoryConfigs();

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    spaces,
    eventMetadata,
    categoryConfigs,
  };
}

export async function restoreBackup(backup: SiteBackup): Promise<void> {
  await db.transaction(async (trx) => {
    // 1. Clear existing data
    await trx("event_metadata").delete();
    await trx("space_sections").delete();
    await trx("spaces").delete();

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
        discourse_category_slug: space.discourseCategorySlug ?? null,
        hierarchy_category: space.hierarchyCategory,
        upload_groups: JSON.stringify(space.uploadGroups),
        sort_order: space.sortOrder,
      };
      await trx("spaces").insert(spaceRow);

      for (const section of space.sections) {
        const sectionRow: SectionRow = {
          id: section.id,
          space_id: space.id,
          name: section.name,
          description: section.description ?? null,
          drive_folder_id: section.driveFolderId,
          sort_order: section.sortOrder,
        };
        await trx("space_sections").insert(sectionRow);
      }
    }

    // 3. Insert event metadata
    if (backup.eventMetadata) {
      for (const meta of backup.eventMetadata) {
        const row: EventMetadataRow = {
          id: meta.id,
          space_id: meta.spaceId,
          google_doc_url: meta.googleDocUrl ?? null,
          agenda_items: JSON.stringify(meta.agendaItems),
        };
        await trx("event_metadata").insert(row);
      }
    }

    // 4. Restore category configs
    await trx("hierarchy_category_configs").delete();
    if (backup.categoryConfigs?.length) {
      for (const config of backup.categoryConfigs) {
        await trx("hierarchy_category_configs").insert({
          name: config.name,
          sort_order: config.sortOrder,
        });
      }
    }
  });
}

export async function resetSite(): Promise<void> {
  await db.transaction(async (trx) => {
    await trx("event_metadata").delete();
    await trx("space_sections").delete();
    await trx("spaces").delete();
    await trx("hierarchy_category_configs").delete();
  });
}

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

export async function createAuditLog(
  log: Omit<AuditLog, "id" | "timestamp">,
): Promise<void> {
  await db("audit_logs").insert({
    user_id: log.userId,
    user_name: log.userName,
    action: log.action,
    entity_type: log.entityType,
    entity_id: log.entityId,
    details: log.details,
  });
}

export interface AuditLogQuery {
  /** Exact action match, e.g. "DELETE_DOCUMENT". */
  action?: string;
  /** Exact entity type match, e.g. "SPACE". */
  entityType?: string;
  /** Case-insensitive substring match against the user's name. */
  user?: string;
  /** Inclusive lower bound as YYYY-MM-DD (interpreted as start of that day). */
  from?: string;
  /** Inclusive upper bound as YYYY-MM-DD (interpreted as end of that day). */
  to?: string;
  limit?: number;
  offset?: number;
}

const MAX_AUDIT_LIMIT = 5000;

/**
 * Builds a filtered audit_logs query. Timestamp bounds are formatted with a
 * space separator (not ISO "T") so string comparison works against SQLite's
 * "YYYY-MM-DD HH:MM:SS" text timestamps as well as Postgres timestamps.
 */
function auditLogQuery(f: AuditLogQuery) {
  let q = db("audit_logs");
  if (f.action) q = q.where("action", f.action);
  if (f.entityType) q = q.where("entity_type", f.entityType);
  if (f.user) {
    q = q.whereRaw("lower(user_name) like ?", [`%${f.user.toLowerCase()}%`]);
  }
  if (f.from) q = q.where("timestamp", ">=", `${f.from} 00:00:00`);
  if (f.to) q = q.where("timestamp", "<=", `${f.to} 23:59:59`);
  return q;
}

export async function getAuditLogs(
  query: AuditLogQuery = {},
): Promise<AuditLog[]> {
  const q = auditLogQuery(query).orderBy("timestamp", "desc");
  if (query.offset) q.offset(query.offset);
  q.limit(Math.min(query.limit ?? 100, MAX_AUDIT_LIMIT));
  const rows = await q;

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

// ---------------------------------------------------------------------------
// Hierarchy Category Configs
// ---------------------------------------------------------------------------

interface CategoryConfigRow {
  name: string;
  sort_order: number;
}

/** Returns all configured category sort orders, ordered by sort_order ascending. */
export async function getCategoryConfigs(): Promise<HierarchyCategoryConfig[]> {
  const rows = await db<CategoryConfigRow>("hierarchy_category_configs").orderBy(
    "sort_order",
  );
  return rows.map((r) => ({ name: r.name, sortOrder: r.sort_order }));
}

/**
 * Bulk-replaces all category sort order entries.
 * Entries not present in the new list are removed.
 */
export async function setCategoryConfigs(
  entries: HierarchyCategoryConfig[],
): Promise<void> {
  await db.transaction(async (trx) => {
    await trx("hierarchy_category_configs").delete();
    if (entries.length > 0) {
      await trx("hierarchy_category_configs").insert(
        entries.map((e) => ({ name: e.name, sort_order: e.sortOrder })),
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Document Read Receipts
// ---------------------------------------------------------------------------

interface DocumentReadRow {
  file_id: string;
  space_id: string;
  user_id: string;
  user_name: string;
  read_at: string;
}

/** Marks a document as read by a user (idempotent — refreshes read_at). */
export async function markDocumentRead(
  fileId: string,
  spaceId: string,
  userId: string,
  userName: string,
): Promise<void> {
  const existing = await db<DocumentReadRow>("document_reads")
    .where({ file_id: fileId, user_id: userId })
    .first();

  if (existing) {
    await db<DocumentReadRow>("document_reads")
      .where({ file_id: fileId, user_id: userId })
      .update({ read_at: db.fn.now(), space_id: spaceId, user_name: userName });
  } else {
    await db<DocumentReadRow>("document_reads").insert({
      file_id: fileId,
      space_id: spaceId,
      user_id: userId,
      user_name: userName,
    });
  }
}

/** Removes a user's read receipt for a document. */
export async function unmarkDocumentRead(
  fileId: string,
  userId: string,
): Promise<void> {
  await db<DocumentReadRow>("document_reads")
    .where({ file_id: fileId, user_id: userId })
    .delete();
}

/** Returns the set of file IDs a user has marked read within a space. */
export async function getUserReadFileIds(
  spaceId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db<DocumentReadRow>("document_reads")
    .where({ space_id: spaceId, user_id: userId })
    .select("file_id");
  return rows.map((r) => r.file_id);
}

/** Returns everyone who has marked a given document read, most recent first. */
export async function getDocumentReaders(
  fileId: string,
): Promise<DocumentReader[]> {
  const rows = await db<DocumentReadRow>("document_reads")
    .where({ file_id: fileId })
    .orderBy("read_at", "desc");
  return rows.map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    readAt: r.read_at,
  }));
}

// ---------------------------------------------------------------------------
// Notifications — activities & subscriptions
// ---------------------------------------------------------------------------

interface ActivityRow {
  id: number;
  space_id: string;
  type: string;
  title: string;
  link: string | null;
  entity_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface NewActivity {
  spaceId: string;
  type: ActivityType;
  title: string;
  link?: string;
  entityId?: string;
  actorName?: string;
}

/** Records a notifiable event and returns it (with generated id/timestamp). */
export async function createActivity(input: NewActivity): Promise<Activity> {
  const [row] = await db<ActivityRow>("activities")
    .insert({
      space_id: input.spaceId,
      type: input.type,
      title: input.title,
      link: input.link ?? null,
      entity_id: input.entityId ?? null,
      actor_name: input.actorName ?? null,
    })
    .returning(["id", "created_at"]);

  return {
    id: typeof row === "object" ? row.id : (row as number),
    spaceId: input.spaceId,
    type: input.type,
    title: input.title,
    link: input.link,
    entityId: input.entityId,
    actorName: input.actorName,
    createdAt:
      typeof row === "object" && row.created_at
        ? row.created_at
        : new Date().toISOString(),
  };
}

export interface Subscriber {
  userId: string;
  email: string;
}

/** Everyone subscribed to a space's notifications. */
export async function getSpaceSubscribers(spaceId: string): Promise<Subscriber[]> {
  const rows = await db("notification_subscriptions")
    .where({ space_id: spaceId })
    .select("user_id", "email");
  return rows.map((r) => ({ userId: r.user_id, email: r.email }));
}

/** Subscribe a user to a space (idempotent — refreshes the stored email). */
export async function subscribeToSpace(
  userId: string,
  spaceId: string,
  email: string,
): Promise<void> {
  const existing = await db("notification_subscriptions")
    .where({ user_id: userId, space_id: spaceId })
    .first();
  if (existing) {
    await db("notification_subscriptions")
      .where({ user_id: userId, space_id: spaceId })
      .update({ email });
  } else {
    await db("notification_subscriptions").insert({
      user_id: userId,
      space_id: spaceId,
      email,
    });
  }
}

export async function unsubscribeFromSpace(
  userId: string,
  spaceId: string,
): Promise<void> {
  await db("notification_subscriptions")
    .where({ user_id: userId, space_id: spaceId })
    .delete();
}

/** The space IDs a user is subscribed to. */
export async function getUserSubscriptions(
  userId: string,
): Promise<NotificationSubscription[]> {
  const rows = await db("notification_subscriptions")
    .where({ user_id: userId })
    .orderBy("created_at", "desc");
  return rows.map((r) => ({
    spaceId: r.space_id,
    email: r.email,
    createdAt: r.created_at,
  }));
}

export default db;
