// Split out of the former single services/db.ts. Import via services/db.js (barrel).
import db from "./client.js";
import { logger } from "../logger.js";

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
    logger.info("[db] Created spaces table");
  }

  // Idempotent column migration: add ical_url if it doesn't exist (existing DBs)
  const hasIcalUrl = await db.schema.hasColumn("spaces", "ical_url");
  if (!hasIcalUrl) {
    await db.schema.alterTable("spaces", (t) => {
      t.string("ical_url").nullable();
    });
    logger.info("[db] Added ical_url column to spaces table");
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
    logger.info("[db] Added discourse_category_slug column to spaces table");
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
    logger.info("[db] Created space_sections table");
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
    logger.info("[db] Created event_metadata table");
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
    logger.info("[db] Created audit_logs table");
  }

  const hasCategoryConfigs = await db.schema.hasTable("hierarchy_category_configs");
  if (!hasCategoryConfigs) {
    await db.schema.createTable("hierarchy_category_configs", (t) => {
      t.string("name").primary();
      t.integer("sort_order").notNullable().defaultTo(0);
    });
    logger.info("[db] Created hierarchy_category_configs table");
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
    logger.info("[db] Created document_reads table");
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
    logger.info("[db] Created activities table");
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
    logger.info("[db] Created notification_subscriptions table");
  }

  // Drive polling sweep — tracks which Drive file ids have been seen per space
  // so files added directly in Google Drive (bypassing the portal) can be
  // detected and notified exactly once, across multiple BFF instances.
  const hasSeenFiles = await db.schema.hasTable("drive_seen_files");
  if (!hasSeenFiles) {
    await db.schema.createTable("drive_seen_files", (t) => {
      t.string("space_id").notNullable();
      t.string("file_id").notNullable();
      t.timestamp("first_seen").notNullable().defaultTo(db.fn.now());
      t.primary(["space_id", "file_id"]);
    });
    logger.info("[db] Created drive_seen_files table");
  }

  // Per-space sweep bootstrap marker: the first sweep of a space seeds the
  // seen-set silently (no notification storm about pre-existing files).
  const hasSweepState = await db.schema.hasTable("drive_sweep_state");
  if (!hasSweepState) {
    await db.schema.createTable("drive_sweep_state", (t) => {
      t.string("space_id").primary();
      t.timestamp("bootstrapped_at").notNullable().defaultTo(db.fn.now());
    });
    logger.info("[db] Created drive_sweep_state table");
  }

  // First-party usage analytics — aggregate only (no per-user page tracking).
  // Retire any earlier per-view table so no identifiable rows linger.
  await db.schema.dropTableIfExists("page_views");

  // Anonymous per-page, per-day view counts (no user identity at all).
  const hasViewCounts = await db.schema.hasTable("page_view_counts");
  if (!hasViewCounts) {
    await db.schema.createTable("page_view_counts", (t) => {
      t.string("day").notNullable(); // YYYY-MM-DD (UTC)
      t.string("path").notNullable();
      t.string("space_id").nullable();
      t.integer("views").notNullable().defaultTo(0);
      t.primary(["day", "path"]);
      t.index(["day"]);
    });
    logger.info("[db] Created page_view_counts table");
  }

  // Anonymous active-user presence: records only that some opaque, irreversible
  // visitor token was active on a day — never which pages they saw. Used solely
  // to count distinct active users. The token is an HMAC of the user id with a
  // server secret, so it cannot be reversed and no names are stored.
  const hasVisitors = await db.schema.hasTable("active_visitors");
  if (!hasVisitors) {
    await db.schema.createTable("active_visitors", (t) => {
      t.string("day").notNullable(); // YYYY-MM-DD (UTC)
      t.string("visitor_hash").notNullable();
      t.primary(["day", "visitor_hash"]);
      t.index(["day"]);
    });
    logger.info("[db] Created active_visitors table");
  }
}

