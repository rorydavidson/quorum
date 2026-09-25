// Split out of the former single services/db.ts. Import via services/db.js (barrel).
import type { AuditLog } from "@snomed/types";
import db from "./client.js";

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

