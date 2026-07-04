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

  it("records a view and derives the space id from a space path", async () => {
    const app = await createApp(makeUser());
    const res = await request(app)
      .post("/metrics/view")
      .send({ path: "/spaces/board/documents" });
    expect(res.status).toBe(204);
    expect(db.recordPageView).toHaveBeenCalledWith({
      userId: "u1",
      userName: "Member One",
      path: "/spaces/board/documents",
      spaceId: "board",
    });
  });

  it("records a non-space path with no space id", async () => {
    const app = await createApp(makeUser());
    await request(app).post("/metrics/view").send({ path: "/dashboard" });
    expect(db.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/dashboard", spaceId: undefined }),
    );
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
