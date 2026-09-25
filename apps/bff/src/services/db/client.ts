import Knex from "knex";

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


export default db;
