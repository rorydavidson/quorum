import { afterEach, describe, expect, it, vi } from "vitest";
import { isCookieSecure } from "./cookies.js";

describe("isCookieSecure", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is secure in production when COOKIE_SECURE is unset or empty", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", undefined);
    expect(isCookieSecure()).toBe(true);
    vi.stubEnv("COOKIE_SECURE", "");
    expect(isCookieSecure()).toBe(true);
  });

  it("is not secure outside production when COOKIE_SECURE is unset", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COOKIE_SECURE", undefined);
    expect(isCookieSecure()).toBe(false);
  });

  it("honours an explicit COOKIE_SECURE in either direction", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "false");
    expect(isCookieSecure()).toBe(false);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COOKIE_SECURE", "TRUE");
    expect(isCookieSecure()).toBe(true);
  });

  it("falls back to the NODE_ENV default for unrecognised values", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "yes");
    expect(isCookieSecure()).toBe(true);
  });
});
