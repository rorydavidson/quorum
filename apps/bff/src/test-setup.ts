/**
 * Vitest global setup — executed before any test module is loaded.
 * Sets environment variables so module-level initialisations (Knex, etc.)
 * pick up safe test values instead of production config.
 */

// Use SQLite in-memory database for all tests.
// db.ts does: process.env.DATABASE_URL?.replace('file:', '') ?? './dev.db'
// ':memory:' → SQLite creates a temporary in-memory database.
process.env.DATABASE_URL = ':memory:';

// A valid 32+ char secret so any code that checks SESSION_SECRET won't exit.
process.env.SESSION_SECRET =
  'test-only-secret-not-used-in-prod-minimum-32-chars';

// Ensure we're not accidentally in production mode during tests.
process.env.NODE_ENV = 'test';

// Never trigger the DEV_AUTH_BYPASS by default — individual tests can override.
delete process.env.DEV_AUTH_BYPASS;

// Prevent discourse.ts from hitting the real Discourse network during tests.
process.env.DISCOURSE_MOCK = 'true';
