/**
 * notifications.test.ts — subscription routes for the "Notify me" feature.
 */

import express from "express";
import session from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { SessionUser, SpaceConfig } from "@snomed/types";

vi.mock("../services/db.js", () => ({
  getSpaceById: vi.fn(),
  getUserSubscriptions: vi.fn(),
  subscribeToSpace: vi.fn(),
  unsubscribeFromSpace: vi.fn(),
}));

import * as db from "../services/db.js";

const BOARD_SPACE: SpaceConfig = {
  id: "board",
  name: "Board",
  keycloakGroup: "/board-members",
  driveFolderId: "folder-board",
  hierarchyCategory: "Board Level",
  uploadGroups: [],
  sortOrder: 1,
  sections: [],
};

function makeUser(groups: string[], email = "member@example.com"): SessionUser {
  return {
    sub: "u1",
    email,
    name: "Member",
    given_name: "Mem",
    family_name: "Ber",
    groups,
  };
}

async function createApp(user?: SessionUser) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-secret", resave: false, saveUninitialized: true }));
  if (user) {
    app.use((req, _res, next) => {
      req.session.user = user;
      next();
    });
  }
  const { default: router } = await import("./notifications.js");
  app.use("/notifications", router);
  return app;
}

describe("Notification subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getSpaceById).mockResolvedValue(BOARD_SPACE);
    vi.mocked(db.getUserSubscriptions).mockResolvedValue([
      { spaceId: "board", email: "member@example.com", createdAt: "2026-07-04 09:00:00" },
    ]);
    vi.mocked(db.subscribeToSpace).mockResolvedValue();
    vi.mocked(db.unsubscribeFromSpace).mockResolvedValue();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = await createApp();
    const res = await request(app).get("/notifications/subscriptions");
    expect(res.status).toBe(401);
  });

  it("lists the caller's subscriptions", async () => {
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).get("/notifications/subscriptions");
    expect(res.status).toBe(200);
    expect(res.body.subscriptions).toHaveLength(1);
    expect(res.body.subscriptions[0].spaceId).toBe("board");
  });

  it("subscribes a member using their session email", async () => {
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).post("/notifications/subscriptions/board");
    expect(res.status).toBe(201);
    expect(db.subscribeToSpace).toHaveBeenCalledWith("u1", "board", "member@example.com");
  });

  it("rejects subscribing to a space the user cannot access", async () => {
    const app = await createApp(makeUser(["/other-group"]));
    const res = await request(app).post("/notifications/subscriptions/board");
    expect(res.status).toBe(403);
    expect(db.subscribeToSpace).not.toHaveBeenCalled();
  });

  it("returns 400 when the account has no email", async () => {
    const app = await createApp(makeUser(["/board-members"], ""));
    const res = await request(app).post("/notifications/subscriptions/board");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_EMAIL");
    expect(db.subscribeToSpace).not.toHaveBeenCalled();
  });

  it("returns 404 when the space does not exist", async () => {
    vi.mocked(db.getSpaceById).mockResolvedValueOnce(undefined);
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).post("/notifications/subscriptions/missing");
    expect(res.status).toBe(404);
  });

  it("unsubscribes the caller", async () => {
    const app = await createApp(makeUser(["/board-members"]));
    const res = await request(app).delete("/notifications/subscriptions/board");
    expect(res.status).toBe(204);
    expect(db.unsubscribeFromSpace).toHaveBeenCalledWith("u1", "board");
  });
});
