/**
 * events.test.ts — integration tests for the event-metadata routes.
 *
 * Focus: server-side validation of POST /events/:spaceId/:eventId, which
 * guards against stored XSS via an unvalidated googleDocUrl (rendered as an
 * <a href> in the frontend) and malformed agendaItems.
 *
 * The db service is mocked so no real DB calls happen.
 */

import express from "express";
import session from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { SessionUser, SpaceConfig } from "@snomed/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../services/db.js", () => ({
  getSpaceById: vi.fn(),
  getEventMetadata: vi.fn(),
  upsertEventMetadata: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock("../services/notifications.js", () => ({
  notifyActivity: vi.fn().mockResolvedValue(0),
}));

import * as db from "../services/db.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function makeUser(groups: string[]): SessionUser {
  return {
    sub: "u1",
    email: "u@example.com",
    name: "U",
    given_name: "U",
    family_name: "U",
    groups,
  };
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function createApp(user?: SessionUser) {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: "test-secret", resave: false, saveUninitialized: true }),
  );
  if (user) {
    app.use((req, _res, next) => {
      req.session.user = user;
      next();
    });
  }
  const { default: eventsRouter } = await import("./events.js");
  app.use("/events", eventsRouter);
  return app;
}

const BOARD_USER = () => makeUser(["/board-members"]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /events/:spaceId/:eventId — auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getSpaceById).mockResolvedValue(BOARD_SPACE);
    vi.mocked(db.getEventMetadata).mockResolvedValue(undefined);
    vi.mocked(db.upsertEventMetadata).mockImplementation(
      async (id, spaceId, payload) => ({
        id,
        spaceId,
        googleDocUrl: payload.googleDocUrl,
        agendaItems: payload.agendaItems ?? [],
      }),
    );
  });

  it("returns 401 when no session user", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/events/board/evt-1")
      .send({ googleDocUrl: "https://docs.google.com/document/d/abc" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user cannot access the space", async () => {
    const app = await createApp(makeUser(["/other-group"]));
    const res = await request(app)
      .post("/events/board/evt-1")
      .send({ googleDocUrl: "https://docs.google.com/document/d/abc" });
    expect(res.status).toBe(403);
    expect(db.upsertEventMetadata).not.toHaveBeenCalled();
  });

  it("returns 404 when the space does not exist", async () => {
    vi.mocked(db.getSpaceById).mockResolvedValueOnce(undefined);
    const app = await createApp(BOARD_USER());
    const res = await request(app)
      .post("/events/missing/evt-1")
      .send({ googleDocUrl: "https://docs.google.com/document/d/abc" });
    expect(res.status).toBe(404);
  });
});

describe("POST /events/:spaceId/:eventId — googleDocUrl validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getSpaceById).mockResolvedValue(BOARD_SPACE);
    vi.mocked(db.getEventMetadata).mockResolvedValue(undefined);
    vi.mocked(db.upsertEventMetadata).mockImplementation(
      async (id, spaceId, payload) => ({
        id,
        spaceId,
        googleDocUrl: payload.googleDocUrl,
        agendaItems: payload.agendaItems ?? [],
      }),
    );
  });

  it("rejects a javascript: URL with 400 and does not write", async () => {
    const app = await createApp(BOARD_USER());
    const res = await request(app)
      .post("/events/board/evt-1")
      .send({ googleDocUrl: "javascript:alert(document.cookie)" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_PAYLOAD");
    expect(db.upsertEventMetadata).not.toHaveBeenCalled();
  });

  it("rejects a data: URL with 400", async () => {
    const app = await createApp(BOARD_USER());
    const res = await request(app)
      .post("/events/board/evt-1")
      .send({ googleDocUrl: "data:text/html,<script>alert(1)</script>" });

    expect(res.status).toBe(400);
    expect(db.upsertEventMetadata).not.toHaveBeenCalled();
  });

  it("accepts a valid https URL", async () => {
    const app = await createApp(BOARD_USER());
    const res = await request(app)
      .post("/events/board/evt-1")
      .send({ googleDocUrl: "https://docs.google.com/document/d/abc123" });

    expect(res.status).toBe(200);
    expect(db.upsertEventMetadata).toHaveBeenCalledWith(
      "evt-1",
      "board",
      expect.objectContaining({
        googleDocUrl: "https://docs.google.com/document/d/abc123",
      }),
    );
  });

  it("accepts an empty string to clear the doc URL", async () => {
    const app = await createApp(BOARD_USER());
    const res = await request(app)
      .post("/events/board/evt-1")
      .send({ googleDocUrl: "" });

    expect(res.status).toBe(200);
    expect(db.upsertEventMetadata).toHaveBeenCalled();
  });

  it("rejects unknown/extra fields (strict schema)", async () => {
    const app = await createApp(BOARD_USER());
    const res = await request(app)
      .post("/events/board/evt-1")
      .send({ evil: "<script>", googleDocUrl: "https://ok.example/doc" });

    expect(res.status).toBe(400);
    expect(db.upsertEventMetadata).not.toHaveBeenCalled();
  });
});

describe("POST /events/:spaceId/:eventId — agendaItems validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getSpaceById).mockResolvedValue(BOARD_SPACE);
    vi.mocked(db.getEventMetadata).mockResolvedValue(undefined);
    vi.mocked(db.upsertEventMetadata).mockImplementation(
      async (id, spaceId, payload) => ({
        id,
        spaceId,
        googleDocUrl: payload.googleDocUrl,
        agendaItems: payload.agendaItems ?? [],
      }),
    );
  });

  it("accepts a well-formed agendaItems array", async () => {
    const app = await createApp(BOARD_USER());
    const res = await request(app)
      .post("/events/board/evt-1")
      .send({
        agendaItems: [
          { id: "a1", text: "Approve minutes", completed: false },
          {
            id: "a2",
            text: "Budget review",
            responsible: "CFO",
            completed: true,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(db.upsertEventMetadata).toHaveBeenCalled();
  });

  it("rejects an agenda item missing required fields", async () => {
    const app = await createApp(BOARD_USER());
    const res = await request(app)
      .post("/events/board/evt-1")
      .send({ agendaItems: [{ id: "a1" }] });

    expect(res.status).toBe(400);
    expect(db.upsertEventMetadata).not.toHaveBeenCalled();
  });

  it("rejects an agenda item with a non-boolean completed", async () => {
    const app = await createApp(BOARD_USER());
    const res = await request(app)
      .post("/events/board/evt-1")
      .send({ agendaItems: [{ id: "a1", text: "x", completed: "yes" }] });

    expect(res.status).toBe(400);
    expect(db.upsertEventMetadata).not.toHaveBeenCalled();
  });
});
