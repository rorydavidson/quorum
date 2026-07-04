import { execSync } from 'child_process';
import path from 'path';

/**
 * Prepares the app for E2E:
 *  1. Builds @snomed/types so tsx (BFF) and Next can resolve it at runtime.
 *  2. Resets and seeds the E2E SQLite DB with sample spaces.
 *
 * The BFF/web dev servers are started by Playwright's `webServer` config using
 * the same DATABASE_URL, DEV_AUTH_BYPASS and mock mode (no external services).
 */
export default async function globalSetup() {
  const root = path.resolve(__dirname, '..');

  // NOTE: do NOT delete the SQLite file here. Playwright may already have
  // started the BFF webServer, which holds the DB open — unlinking it on Linux
  // leaves the BFF reading the old (empty) inode while the seed writes a new
  // one. The seed uses idempotent upserts, so writing into whatever file the
  // BFF has open is both safe and correct.

  execSync('pnpm --filter @snomed/types build', { stdio: 'inherit', cwd: root });

  execSync('pnpm --filter bff exec tsx src/seed.ts', {
    stdio: 'inherit',
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: 'file:./e2e.db',
      NODE_ENV: 'development',
    },
  });
}
