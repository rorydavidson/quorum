// Split out of the former single services/db.ts. Import via services/db.js (barrel).
import type {
  UsageMetrics,
  UsageWindow,
  DailyUsage,
  SpaceUsage,
  PathUsage,
} from "@snomed/types";
import db from "./client.js";

// ---------------------------------------------------------------------------
// Usage analytics
// ---------------------------------------------------------------------------

function utcDay(msAgo = 0): string {
  return new Date(Date.now() - msAgo).toISOString().slice(0, 10);
}

function toNum(v: unknown): number {
  return typeof v === "number" ? v : parseInt(String(v ?? 0), 10) || 0;
}

/**
 * Records a page view in aggregate form only:
 *  - bumps the anonymous view count for (day, path)
 *  - marks the opaque visitor token active for the day (for unique counts)
 * No user identity and no who-viewed-what linkage is stored.
 */
export async function recordPageView(input: {
  path: string;
  spaceId?: string;
  visitorHash: string;
}): Promise<void> {
  const day = utcDay();

  await db("page_view_counts")
    .insert({ day, path: input.path, space_id: input.spaceId ?? null, views: 1 })
    .onConflict(["day", "path"])
    .merge({ views: db.raw("?? + 1", ["page_view_counts.views"]) });

  await db("active_visitors")
    .insert({ day, visitor_hash: input.visitorHash })
    .onConflict(["day", "visitor_hash"])
    .ignore();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Distinct active users (opaque tokens) since the given UTC day, inclusive. */
async function uniqueUsersSince(day: string): Promise<number> {
  const [row] = await db("active_visitors")
    .where("day", ">=", day)
    .countDistinct({ users: "visitor_hash" });
  return toNum(row?.users);
}

/** Total views since the given UTC day, inclusive. */
async function viewsSince(day?: string): Promise<number> {
  const q = db("page_view_counts").sum({ views: "views" });
  if (day) q.where("day", ">=", day);
  const [row] = await q;
  return toNum(row?.views);
}

async function usageWindow(day?: string): Promise<UsageWindow> {
  const [views, uniqueUsers] = await Promise.all([
    viewsSince(day),
    day ? uniqueUsersSince(day) : uniqueUsersSince("0000-00-00"),
  ]);
  return { views, uniqueUsers };
}

/** Builds the aggregate analytics bundle for the admin dashboard. */
export async function getUsageMetrics(): Promise<UsageMetrics> {
  const today = utcDay();
  const day7 = utcDay(6 * DAY_MS);
  const day30 = utcDay(29 * DAY_MS);

  const [totals, todayWindow, last7d, last30d] = await Promise.all([
    usageWindow(),
    usageWindow(today),
    usageWindow(day7),
    usageWindow(day30),
  ]);

  // Daily series — views from counts, unique users from presence, per day.
  const [viewsByDay, usersByDay] = await Promise.all([
    db("page_view_counts").where("day", ">=", day30).select("day").sum({ views: "views" }).groupBy("day") as unknown as Promise<Array<{ day: string; views: number | string }>>,
    db("active_visitors").where("day", ">=", day30).select("day").count({ users: "visitor_hash" }).groupBy("day") as unknown as Promise<Array<{ day: string; users: number | string }>>,
  ]);
  const viewsMap = new Map(viewsByDay.map((r) => [String(r.day), toNum(r.views)]));
  const usersMap = new Map(usersByDay.map((r) => [String(r.day), toNum(r.users)]));
  const daily: DailyUsage[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = utcDay(i * DAY_MS);
    daily.push({ date, views: viewsMap.get(date) ?? 0, uniqueUsers: usersMap.get(date) ?? 0 });
  }

  const perSpaceRows = (await db("page_view_counts")
    .whereNotNull("space_id")
    .select("space_id")
    .sum({ views: "views" })
    .groupBy("space_id")
    .orderBy("views", "desc")) as unknown as Array<{ space_id: string; views: number | string }>;
  const perSpace: SpaceUsage[] = perSpaceRows.map((r) => ({
    spaceId: String(r.space_id),
    views: toNum(r.views),
  }));

  const topPathRows = (await db("page_view_counts")
    .select("path")
    .sum({ views: "views" })
    .groupBy("path")
    .orderBy("views", "desc")
    .limit(10)) as unknown as Array<{ path: string; views: number | string }>;
  const topPaths: PathUsage[] = topPathRows.map((r) => ({
    path: String(r.path),
    views: toNum(r.views),
  }));

  return {
    generatedAt: new Date().toISOString(),
    totals,
    today: todayWindow,
    last7d,
    last30d,
    daily,
    perSpace,
    topPaths,
  };
}

