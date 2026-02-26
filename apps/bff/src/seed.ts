/**
 * Dev seed — populates the local SQLite DB with sample spaces.
 * Run once: pnpm --filter bff exec tsx src/seed.ts
 *
 * These are placeholder spaces using fake Drive folder IDs.
 * Replace driveFolderId values with real Google Drive folder IDs when
 * connecting a service account.
 */
import 'dotenv/config';
import { runMigrations, upsertSpace } from './services/db.js';

async function seed() {
  await runMigrations();

  const spaces = [
    {
      id: 'board',
      name: 'Board of Management',
      description: 'Agendas, minutes, and resolutions for the Board of Management.',
      keycloakGroup: 'board-members',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      calendarId: undefined,
      hierarchyCategory: 'Board Level',
      uploadGroups: ['secretariat'],
      sortOrder: 0,
    },
    {
      id: 'general-assembly',
      name: 'General Assembly',
      description: 'Documents and records for the General Assembly.',
      keycloakGroup: 'general-assembly',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      calendarId: undefined,
      hierarchyCategory: 'Board Level',
      uploadGroups: ['secretariat'],
      sortOrder: 1,
    },
    {
      id: 'technical-committee',
      name: 'Technical Committee',
      description: 'Technical working documents, proposals, and meeting materials.',
      keycloakGroup: 'technical-committee',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      calendarId: undefined,
      hierarchyCategory: 'Working Groups',
      uploadGroups: ['secretariat', 'technical-committee'],
      sortOrder: 2,
    },
    {
      id: 'editorial-committee',
      name: 'Editorial Advisory Committee',
      description: 'Editorial guidelines, release notes, and advisory materials.',
      keycloakGroup: 'editorial-committee',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      calendarId: undefined,
      hierarchyCategory: 'Working Groups',
      uploadGroups: ['secretariat', 'editorial-committee'],
      sortOrder: 3,
    },
    {
      id: 'executive',
      name: 'Executive',
      description: 'Confidential executive papers and correspondence.',
      keycloakGroup: 'portal_admin',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      calendarId: undefined,
      hierarchyCategory: 'Administration',
      uploadGroups: ['secretariat'],
      sortOrder: 4,
    },
  ];

  for (const space of spaces) {
    await upsertSpace(space.id, space);
    console.log(`  ✓ ${space.name}`);
  }

  console.log('\nSeed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
