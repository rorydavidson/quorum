/**
 * Database service — barrel.
 *
 * The implementation lives in ./db/, one module per domain:
 *   client        Knex instance and dialect detection
 *   migrations    idempotent startup schema migration
 *   spaces        spaces and their document sections
 *   events        per-event metadata (agenda, linked doc)
 *   backup        site export / import / reset
 *   audit         audit log
 *   categories    hierarchy category sort order
 *   reads         document read receipts
 *   notifications activities and "Notify me" subscriptions
 *   sweep         Drive polling sweep state
 *   metrics       anonymous usage analytics
 *
 * Everything is re-exported here so callers (and test mocks) keep importing
 * from "../services/db.js".
 */

export { default, isPostgresDb } from "./db/client.js";
export * from "./db/migrations.js";
export * from "./db/spaces.js";
export * from "./db/events.js";
export * from "./db/backup.js";
export * from "./db/audit.js";
export * from "./db/categories.js";
export * from "./db/reads.js";
export * from "./db/notifications.js";
export * from "./db/sweep.js";
export * from "./db/metrics.js";
