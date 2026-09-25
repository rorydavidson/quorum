import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler, type AppError } from "./errorHandler.js";

function appThrowing(err: AppError) {
  const app = express();
  app.use(express.json());
  app.get("/boom", (_req, _res, next) => next(err));
  app.post("/echo", (req, res) => {
    res.json(req.body);
  });
  app.use(errorHandler);
  return app;
}

function makeError(message: string, extra: Partial<AppError> = {}): AppError {
  return Object.assign(new Error(message), extra);
}

describe("errorHandler", () => {
  it("hides the underlying message on a 500 and uses INTERNAL_ERROR", async () => {
    const res = await request(
      appThrowing(makeError('select * from "spaces" - relation does not exist')),
    ).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal Server Error", code: "INTERNAL_ERROR" });
    expect(JSON.stringify(res.body)).not.toContain("spaces");
  });

  it("hides the message but keeps a custom code on other 5xx errors", async () => {
    const res = await request(
      appThrowing(makeError("upstream host drive.internal timed out", { status: 502, code: "DRIVE_ERROR" })),
    ).get("/boom");

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "Internal Server Error", code: "DRIVE_ERROR" });
  });

  it("keeps the message and code on a 4xx error", async () => {
    const res = await request(
      appThrowing(makeError("Folder is not within this space", { status: 403, code: "FOLDER_OUTSIDE_SPACE" })),
    ).get("/boom");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Folder is not within this space", code: "FOLDER_OUTSIDE_SPACE" });
  });

  it("honours statusCode as well as status", async () => {
    const res = await request(
      appThrowing(makeError("Not found", { statusCode: 404, code: "NOT_FOUND" })),
    ).get("/boom");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("returns a 400 with the parser message for malformed JSON bodies", async () => {
    const res = await request(appThrowing(makeError("unused")))
      .post("/echo")
      .set("Content-Type", "application/json")
      .send("{ not json");

    expect(res.status).toBe(400);
    expect(res.body.code).toBeDefined();
    expect(typeof res.body.error).toBe("string");
  });
});
