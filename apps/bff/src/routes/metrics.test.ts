import express from "express";
import session from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { SessionUser } from "@snomed/types";

vi.mock("../services/db.js", () => ({
  recordPageView: vi.fn().mockResolvedValue(undefined),
}));

import * as db from "../services/db.js";

function makeUser(): SessionUser {
  return {
    sub: "u1",
    email: "u@example.com",
    name: "Member One",
    given_name: "Member",
    family_name: "One",
    groups: ["/board-members"],
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
  const { default: router } = await import("./metrics.js");
  app.use("/metrics", router);
  return app;
}

describe("POST /metrics/view", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const app = await createApp();
    const res = await request(app).post("/metrics/view").send({ path: "/dashboard" });
    expect(res.status).toBe(401);
  });

  it("records a view (aggregate only) and derives the space id from a space path", async () => {
    const app = await createApp(makeUser());
    const res = await request(app)
      .post("/metrics/view")
      .send({ path: "/spaces/board/documents" });
    expect(res.status).toBe(204);
    const arg = vi.mocked(db.recordPageView).mock.calls[0][0];
    expect(arg.path).toBe("/spaces/board/documents");
    expect(arg.spaceId).toBe("board");
    // Anonymous, opaque token — no user id or name is passed through.
    expect(typeof arg.visitorHash).toBe("string");
    expect(arg.visitorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(arg).not.toHaveProperty("userId");
    expect(arg).not.toHaveProperty("userName");
  });

  it("records a non-space path with no space id", async () => {
    const app = await createApp(makeUser());
    await request(app).post("/metrics/view").send({ path: "/dashboard" });
    expect(db.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/dashboard", spaceId: undefined }),
    );
  });

  it("produces a stable token for the same user across views", async () => {
    const app = await createApp(makeUser());
    await request(app).post("/metrics/view").send({ path: "/dashboard" });
    await request(app).post("/metrics/view").send({ path: "/search" });
    const calls = vi.mocked(db.recordPageView).mock.calls;
    expect(calls[0][0].visitorHash).toBe(calls[1][0].visitorHash);
  });

  it("strips query strings before storing", async () => {
    const app = await createApp(makeUser());
    await request(app).post("/metrics/view").send({ path: "/search?q=budget" });
    expect(db.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/search" }),
    );
  });

  it("rejects a non-path value", async () => {
    const app = await createApp(makeUser());
    const res = await request(app).post("/metrics/view").send({ path: "javascript:evil" });
    expect(res.status).toBe(400);
    expect(db.recordPageView).not.toHaveBeenCalled();
  });
});
