/**
 * Dev seed — populates the local SQLite DB with sample spaces.
 * Run once: pnpm --filter bff exec tsx src/seed.ts
 *
 * These are placeholder spaces using fake Drive folder IDs.
 * Replace driveFolderId values with real Google Drive folder IDs when
 * connecting a service account.
 */
import 'dotenv/config';
import { runMigrations, upsertSpace, upsertSection } from './services/db.js';

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

  // Demo sections for Board of Management — each backed by a different Drive folder
  const boardSections = [
    {
      id: 'agendas',
      name: 'Agendas',
      description: 'Meeting agendas distributed before each board meeting.',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      sortOrder: 0,
    },
    {
      id: 'minutes',
      name: 'Minutes & Resolutions',
      description: 'Approved minutes and formal resolutions from board meetings.',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      sortOrder: 1,
    },
    {
      id: 'papers',
      name: 'Board Papers',
      description: 'Working papers, reports, and background documents.',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      sortOrder: 2,
    },
    {
      id: 'governance',
      name: 'Governance Documents',
      description: 'Constitution, by-laws, policies, and standing orders.',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      sortOrder: 3,
    },
  ];

  console.log('\nSeeding Board of Management sections...');
  for (const section of boardSections) {
    await upsertSection('board', section.id, section);
    console.log(`  ✓ board / ${section.name}`);
  }

  // Demo sections for General Assembly
  const assemblySections = [
    {
      id: 'agendas',
      name: 'Agendas',
      description: 'General Assembly meeting agendas.',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      sortOrder: 0,
    },
    {
      id: 'resolutions',
      name: 'Resolutions',
      description: 'Formal resolutions passed by the General Assembly.',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      sortOrder: 1,
    },
    {
      id: 'reports',
      name: 'Annual Reports',
      description: 'Annual reports presented to the General Assembly.',
      driveFolderId: 'REPLACE_WITH_REAL_FOLDER_ID',
      sortOrder: 2,
    },
  ];

  console.log('\nSeeding General Assembly sections...');
  for (const section of assemblySections) {
    await upsertSection('general-assembly', section.id, section);
    console.log(`  ✓ general-assembly / ${section.name}`);
  }

  console.log('\nSeed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
