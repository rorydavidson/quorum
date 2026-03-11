/**
 * auth.test.ts — integration tests for the auth routes
 *
 * The keycloak service is fully mocked. express-session uses an in-process
 * MemoryStore so session state is real (save/destroy work normally).
 */

import express from "express";
import session from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { SessionUser } from "@snomed/types";

// ---------------------------------------------------------------------------
// Mock keycloak service before auth router is imported
// ---------------------------------------------------------------------------

const mockBuildAuthParams = vi.fn();
const mockExchangeCodeForTokens = vi.fn();
const mockParseIdToken = vi.fn();
const mockRefreshTokens = vi.fn();
const mockBuildLogoutUrl = vi.fn();

vi.mock("../services/keycloak.js", () => ({
  buildAuthParams: mockBuildAuthParams,
  exchangeCodeForTokens: mockExchangeCodeForTokens,
  parseIdToken: mockParseIdToken,
  refreshTokens: mockRefreshTokens,
  buildLogoutUrl: mockBuildLogoutUrl,
  initKeycloak: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_STATE = "mock-oauth-state";
const MOCK_NONCE = "mock-oauth-nonce";
const MOCK_AUTH_URL = "https://snoauth.example.org/auth?state=mock-oauth-state";
const MOCK_LOGOUT_URL =
  "https://snoauth.example.org/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000";

const MOCK_SESSION_USER: SessionUser = {
  sub: "user-sub-123",
  email: "alice@example.com",
  name: "Alice Example",
  given_name: "Alice",
  family_name: "Example",
  groups: ["/board-members"],
};

const MOCK_TOKEN_SET = {
  id_token: "id-token-value",
  access_token: "access-token-value",
  refresh_token: "refresh-token-value",
};

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

type SessionPatch = {
  user?: SessionUser;
  oauthState?: string;
  oauthNonce?: string;
  refreshToken?: string;
};

async function createApp(patch: SessionPatch = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret-for-auth-routes",
      resave: false,
      saveUninitialized: true,
    }),
  );

  // Pre-populate session with any provided values
  if (Object.keys(patch).length > 0) {
    app.use((req, _res, next) => {
      if (patch.user) req.session.user = patch.user;
      if (patch.oauthState) req.session.oauthState = patch.oauthState;
      if (patch.oauthNonce) req.session.oauthNonce = patch.oauthNonce;
      if (patch.refreshToken) req.session.refreshToken = patch.refreshToken;
      next();
    });
  }

  const { default: authRouter } = await import("./auth.js");
  app.use("/auth", authRouter);
  return app;
}

// ---------------------------------------------------------------------------
// GET /auth/login
// ---------------------------------------------------------------------------

describe("GET /auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAuthParams.mockReturnValue({
      state: MOCK_STATE,
      nonce: MOCK_NONCE,
      authorizationUrl: MOCK_AUTH_URL,
    });
  });

  it("redirects to the Keycloak authorization URL", async () => {
    const app = await createApp();
    const res = await request(app).get("/auth/login");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe(MOCK_AUTH_URL);
  });

  it("calls buildAuthParams()", async () => {
    const app = await createApp();
    await request(app).get("/auth/login");
    expect(mockBuildAuthParams).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// GET /auth/callback
// ---------------------------------------------------------------------------

describe("GET /auth/callback", () => {
  beforeEach(() => {
    mockExchangeCodeForTokens.mockResolvedValue(MOCK_TOKEN_SET);
    mockParseIdToken.mockReturnValue(MOCK_SESSION_USER);
    mockBuildAuthParams.mockReturnValue({
      state: MOCK_STATE,
      nonce: MOCK_NONCE,
      authorizationUrl: MOCK_AUTH_URL,
    });
  });

  it("returns 400 when session has no oauthState/oauthNonce", async () => {
    const app = await createApp({}); // no oauth state in session
    const res = await request(app).get("/auth/callback?code=test&state=test");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_STATE");
  });

  it("redirects to /dashboard on successful token exchange", async () => {
    const app = await createApp();
    const res = await request(app)
      .get(`/auth/callback?code=auth-code&state=${MOCK_STATE}`)
      .set("Cookie", `oauth_state=${MOCK_STATE}; oauth_nonce=${MOCK_NONCE}`);
    expect(res.status).toBe(302);
    expect(res.header.location).toMatch(/\/dashboard$/);
  });

  it("calls exchangeCodeForTokens with the callback URL and session state", async () => {
    const app = await createApp();
    await request(app)
      .get(`/auth/callback?code=auth-code&state=${MOCK_STATE}`)
      .set("Cookie", `oauth_state=${MOCK_STATE}; oauth_nonce=${MOCK_NONCE}`);
    expect(mockExchangeCodeForTokens).toHaveBeenCalledWith(
      expect.stringContaining("/auth/callback"),
      MOCK_STATE,
      MOCK_NONCE,
    );
  });

  it("returns 500 when exchangeCodeForTokens throws", async () => {
    mockExchangeCodeForTokens.mockRejectedValueOnce(new Error("invalid state"));
    const app = await createApp();
    const res = await request(app)
      .get(`/auth/callback?code=bad&state=${MOCK_STATE}`)
      .set("Cookie", `oauth_state=${MOCK_STATE}; oauth_nonce=${MOCK_NONCE}`);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("AUTH_ERROR");
  });
});

// ---------------------------------------------------------------------------
// GET /auth/logout
// ---------------------------------------------------------------------------

describe("GET /auth/logout", () => {
  beforeEach(() => {
    mockBuildLogoutUrl.mockReturnValue(MOCK_LOGOUT_URL);
  });

  it("redirects to the Keycloak logout URL", async () => {
    const app = await createApp({ user: MOCK_SESSION_USER });
    const res = await request(app).get("/auth/logout");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe(MOCK_LOGOUT_URL);
  });

  it("calls buildLogoutUrl with the frontend origin", async () => {
    const app = await createApp({ user: MOCK_SESSION_USER });
    await request(app).get("/auth/logout");
    expect(mockBuildLogoutUrl).toHaveBeenCalledWith(expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// GET /auth/session
// ---------------------------------------------------------------------------

describe("GET /auth/session", () => {
  it("returns 401 when no user is in the session", async () => {
    const app = await createApp({});
    const res = await request(app).get("/auth/session");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });

  it("returns the user object when authenticated", async () => {
    const app = await createApp({ user: MOCK_SESSION_USER });
    const res = await request(app).get("/auth/session");
    expect(res.status).toBe(200);
    expect(res.body.user.sub).toBe("user-sub-123");
    expect(res.body.user.email).toBe("alice@example.com");
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

describe("POST /auth/refresh", () => {
  beforeEach(() => {
    mockRefreshTokens.mockResolvedValue(MOCK_TOKEN_SET);
    mockParseIdToken.mockReturnValue({
      ...MOCK_SESSION_USER,
      name: "Alice Refreshed",
    });
  });

  it("returns 401 when no user is in the session", async () => {
    const app = await createApp({});
    const res = await request(app).post("/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 when user is set but refreshToken is absent", async () => {
    const app = await createApp({ user: MOCK_SESSION_USER }); // no refreshToken
    const res = await request(app).post("/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("calls refreshTokens with the stored refresh token and returns the updated user", async () => {
    const app = await createApp({
      user: MOCK_SESSION_USER,
      refreshToken: "old-refresh-token",
    });
    const res = await request(app).post("/auth/refresh");

    expect(res.status).toBe(200);
    expect(mockRefreshTokens).toHaveBeenCalledWith("old-refresh-token");
    expect(res.body.user.name).toBe("Alice Refreshed");
  });

  it("returns 401 SESSION_EXPIRED when refreshTokens throws", async () => {
    mockRefreshTokens.mockRejectedValueOnce(new Error("token expired"));
    const app = await createApp({
      user: MOCK_SESSION_USER,
      refreshToken: "stale-token",
    });
    const res = await request(app).post("/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_EXPIRED");
  });
});
