/**
 * notifications.test.ts — the notify-fan-out service.
 *
 * db and mailer are mocked so no DB or SMTP is touched.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", () => ({
  createActivity: vi.fn(),
  getSpaceSubscribers: vi.fn(),
}));
vi.mock("./mailer.js", () => ({
  sendMail: vi.fn(),
}));

import * as db from "./db.js";
import * as mailer from "./mailer.js";
import { notifyActivity } from "./notifications.js";

describe("notifyActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.createActivity).mockResolvedValue({
      id: 1,
      spaceId: "board",
      type: "NEW_DOCUMENT",
      title: "New document: Minutes.pdf",
      createdAt: "2026-07-04 09:00:00",
    });
    vi.mocked(mailer.sendMail).mockResolvedValue(true);
  });

  it("records the activity and emails subscribers, excluding the actor", async () => {
    vi.mocked(db.getSpaceSubscribers).mockResolvedValue([
      { userId: "actor", email: "actor@example.com" },
      { userId: "reader-1", email: "r1@example.com" },
      { userId: "reader-2", email: "r2@example.com" },
    ]);

    const sent = await notifyActivity({
      spaceId: "board",
      spaceName: "Board",
      type: "NEW_DOCUMENT",
      title: "New document: Minutes.pdf",
      link: "/spaces/board/documents",
      actorName: "Actor",
      actorUserId: "actor",
    });

    expect(db.createActivity).toHaveBeenCalledOnce();
    expect(sent).toBe(2);
    expect(mailer.sendMail).toHaveBeenCalledTimes(2);
    const recipients = vi.mocked(mailer.sendMail).mock.calls.map((c) => c[0].to);
    expect(recipients).toEqual(["r1@example.com", "r2@example.com"]);
    // subject includes the space name
    expect(vi.mocked(mailer.sendMail).mock.calls[0][0].subject).toContain("Board");
  });

  it("sends nothing when there are no other subscribers", async () => {
    vi.mocked(db.getSpaceSubscribers).mockResolvedValue([
      { userId: "actor", email: "actor@example.com" },
    ]);
    const sent = await notifyActivity({
      spaceId: "board",
      spaceName: "Board",
      type: "NEW_DOCUMENT",
      title: "x",
      actorUserId: "actor",
    });
    expect(sent).toBe(0);
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it("never throws if the DB errors", async () => {
    vi.mocked(db.createActivity).mockRejectedValue(new Error("db down"));
    const sent = await notifyActivity({
      spaceId: "board",
      spaceName: "Board",
      type: "NEW_DOCUMENT",
      title: "x",
    });
    expect(sent).toBe(0);
  });
});
