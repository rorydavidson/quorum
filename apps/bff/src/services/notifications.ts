import type { ActivityType } from "@snomed/types";
import { logger } from "./logger.js";
import {
  createActivity,
  getSpaceSubscribers,
  type NewActivity,
} from "./db.js";
import { sendMail } from "./mailer.js";

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

const SUBJECT_PREFIX: Record<ActivityType, string> = {
  NEW_DOCUMENT: "New document",
  NEW_OFFICIAL_RECORD: "New Official Record",
  EVENT_UPDATED: "Meeting updated",
};

interface NotifyInput extends NewActivity {
  /** Human-readable space name for the email body. */
  spaceName: string;
  /** The user who triggered the event — excluded from the recipient list. */
  actorUserId?: string;
}

/**
 * Records an activity and emails every subscriber of the space (best-effort,
 * fire-and-forget). Never throws — a mail/DB hiccup must not fail the action
 * that triggered it. Returns the number of emails dispatched.
 */
export async function notifyActivity(input: NotifyInput): Promise<number> {
  let sent = 0;
  try {
    await createActivity(input);

    const subscribers = await getSpaceSubscribers(input.spaceId);
    const recipients = subscribers.filter((s) => s.userId !== input.actorUserId);
    if (recipients.length === 0) {
      logger.info(
        { spaceId: input.spaceId, type: input.type, subscribers: subscribers.length },
        "Notification fan-out skipped — no recipients (actor excluded)",
      );
      return 0;
    }

    const link = input.link ? `${FRONTEND_ORIGIN}${input.link}` : FRONTEND_ORIGIN;
    const subject = `[${input.spaceName}] ${SUBJECT_PREFIX[input.type]}`;
    const actor = input.actorName ? ` by ${input.actorName}` : "";
    const text =
      `${input.title}${actor}\n\n` +
      `Space: ${input.spaceName}\n` +
      `Open in Quorum: ${link}\n\n` +
      `You are receiving this because you subscribed to notifications for this space. ` +
      `Manage your notifications in the portal.`;
    const html =
      `<p>${escapeHtml(input.title)}${escapeHtml(actor)}</p>` +
      `<p><strong>Space:</strong> ${escapeHtml(input.spaceName)}</p>` +
      `<p><a href="${encodeURI(link)}">Open in Quorum</a></p>` +
      `<hr><p style="color:#6b7280;font-size:12px">You are receiving this because you subscribed to ` +
      `notifications for this space. Manage your notifications in the portal.</p>`;

    const results = await Promise.all(
      recipients.map((r) => sendMail({ to: r.email, subject, text, html })),
    );
    sent = results.filter(Boolean).length;
    logger.info(
      { spaceId: input.spaceId, type: input.type, recipients: recipients.length, sent },
      "Notification fan-out",
    );
  } catch (err) {
    logger.error({ err }, "notifyActivity failed");
  }
  return sent;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type { ActivityType };
