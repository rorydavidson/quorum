// Split out of the former single services/db.ts. Import via services/db.js (barrel).
import type {
  Activity,
  ActivityType,
  NotificationSubscription,
  SpaceSubscriber,
} from "@snomed/types";
import db from "./client.js";

// ---------------------------------------------------------------------------
// Notifications — activities & subscriptions
// ---------------------------------------------------------------------------

interface ActivityRow {
  id: number;
  space_id: string;
  type: string;
  title: string;
  link: string | null;
  entity_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface NewActivity {
  spaceId: string;
  type: ActivityType;
  title: string;
  link?: string;
  entityId?: string;
  actorName?: string;
}

/** Records a notifiable event and returns it (with generated id/timestamp). */
export async function createActivity(input: NewActivity): Promise<Activity> {
  const [row] = await db<ActivityRow>("activities")
    .insert({
      space_id: input.spaceId,
      type: input.type,
      title: input.title,
      link: input.link ?? null,
      entity_id: input.entityId ?? null,
      actor_name: input.actorName ?? null,
    })
    .returning(["id", "created_at"]);

  return {
    id: typeof row === "object" ? row.id : (row as number),
    spaceId: input.spaceId,
    type: input.type,
    title: input.title,
    link: input.link,
    entityId: input.entityId,
    actorName: input.actorName,
    createdAt:
      typeof row === "object" && row.created_at
        ? row.created_at
        : new Date().toISOString(),
  };
}

export interface Subscriber {
  userId: string;
  email: string;
}

/** Everyone subscribed to a space's notifications. */
export async function getSpaceSubscribers(spaceId: string): Promise<Subscriber[]> {
  const rows = await db("notification_subscriptions")
    .where({ space_id: spaceId })
    .select("user_id", "email");
  return rows.map((r) => ({ userId: r.user_id, email: r.email }));
}

/** Subscribe a user to a space (idempotent — refreshes the stored email). */
export async function subscribeToSpace(
  userId: string,
  spaceId: string,
  email: string,
): Promise<void> {
  const existing = await db("notification_subscriptions")
    .where({ user_id: userId, space_id: spaceId })
    .first();
  if (existing) {
    await db("notification_subscriptions")
      .where({ user_id: userId, space_id: spaceId })
      .update({ email });
  } else {
    await db("notification_subscriptions").insert({
      user_id: userId,
      space_id: spaceId,
      email,
    });
  }
}

export async function unsubscribeFromSpace(
  userId: string,
  spaceId: string,
): Promise<void> {
  await db("notification_subscriptions")
    .where({ user_id: userId, space_id: spaceId })
    .delete();
}

/** All subscriptions across all spaces — admin visibility + backup export. */
export async function getAllSubscriptions(): Promise<SpaceSubscriber[]> {
  const rows = await db("notification_subscriptions")
    .orderBy(["space_id", "created_at"]);
  return rows.map((r) => ({
    userId: r.user_id,
    spaceId: r.space_id,
    email: r.email,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

/** The space IDs a user is subscribed to. */
export async function getUserSubscriptions(
  userId: string,
): Promise<NotificationSubscription[]> {
  const rows = await db("notification_subscriptions")
    .where({ user_id: userId })
    .orderBy("created_at", "desc");
  return rows.map((r) => ({
    spaceId: r.space_id,
    email: r.email,
    createdAt: r.created_at,
  }));
}

