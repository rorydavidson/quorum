import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { logger, reqLog } from "./logger.js";

describe("reqLog", () => {
  it("falls back to the base logger when no request logger is attached", () => {
    expect(reqLog({} as Request)).toBe(logger);
  });

  it("returns the request-scoped child logger when pino-http attached one", () => {
    const child = logger.child({ reqId: "abc123" });
    const req = { log: child } as unknown as Request;
    expect(reqLog(req)).toBe(child);
  });
});
