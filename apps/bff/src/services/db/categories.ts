// Split out of the former single services/db.ts. Import via services/db.js (barrel).
import type { HierarchyCategoryConfig } from "@snomed/types";
import db from "./client.js";

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

