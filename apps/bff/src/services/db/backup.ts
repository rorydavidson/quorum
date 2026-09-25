// Split out of the former single services/db.ts. Import via services/db.js (barrel).
import type {
  SpaceConfig,
  EventMetadata,
  HierarchyCategoryConfig,
  SpaceSubscriber,
} from "@snomed/types";
import db from "./client.js";
import { getSpaces, type SpaceRow, type SectionRow } from "./spaces.js";
import { rowToEventMetadata, type EventMetadataRow } from "./events.js";
import { getCategoryConfigs } from "./categories.js";
import { getAllSubscriptions } from "./notifications.js";

// ---------------------------------------------------------------------------
// Backup & Restore
// ---------------------------------------------------------------------------

export interface SiteBackup {
  version: number;
  timestamp: string;
  spaces: SpaceConfig[];
  eventMetadata: EventMetadata[];
  categoryConfigs?: HierarchyCategoryConfig[];
  subscriptions?: SpaceSubscriber[];
}

export async function getBackup(): Promise<SiteBackup> {
  const spaces = await getSpaces();
  const eventMetadataRows = await db<EventMetadataRow>("event_metadata");
  const eventMetadata = eventMetadataRows.map(rowToEventMetadata);
  const categoryConfigs = await getCategoryConfigs();
  const subscriptions = await getAllSubscriptions();

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    spaces,
    eventMetadata,
    categoryConfigs,
    subscriptions,
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
        // Guard against older backups that omit the field: JSON.stringify(undefined)
        // is the string "undefined", which breaks JSON.parse on every later read.
        upload_groups: JSON.stringify(space.uploadGroups ?? []),
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

    // 5. Restore notification subscriptions (only for spaces in this backup,
    // to respect the FK-free but logically-linked space ids)
    await trx("notification_subscriptions").delete();
    if (backup.subscriptions?.length) {
      const spaceIds = new Set(backup.spaces.map((s) => s.id));
      for (const sub of backup.subscriptions) {
        if (!spaceIds.has(sub.spaceId)) continue;
        await trx("notification_subscriptions").insert({
          user_id: sub.userId,
          space_id: sub.spaceId,
          email: sub.email,
          created_at: sub.createdAt,
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

