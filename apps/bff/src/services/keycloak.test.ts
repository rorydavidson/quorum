/**
 * keycloak.test.ts — unit tests for the Keycloak service
 *
 * openid-client is mocked throughout. The module-level singleton state
 * (_client / _issuer) is exercised in order:
 *   1. Tests that don't depend on the client run first (parseIdToken).
 *   2. buildLogoutUrl is tested BEFORE initKeycloak (issuer is null → fallback).
 *   3. initKeycloak() is called once via beforeAll in the "after init" describe.
 *   4. Remaining tests run after the client is initialised.
 *
 * IMPORTANT: vi.mock() factories are hoisted ABOVE const declarations, so any
 * variables referenced inside a factory must be created with vi.hoisted() to
 * guarantee they exist when the factory runs.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock variables so the vi.mock() factory can reference them safely.
// vi.hoisted() runs its callback before vi.mock() factories, ensuring the
// variables are initialised even in the hoisted position.
// ---------------------------------------------------------------------------

const {
  MOCK_END_SESSION,
  mockClientInstance,
  MockClientConstructor,
  mockIssuer,
} = vi.hoisted(() => {
  const MOCK_AUTH_URL =
    "https://snoauth.example.org/realms/snomed/protocol/openid-connect/auth?state=mock-state&nonce=mock-nonce";
  const MOCK_END_SESSION =
    "https://snoauth.example.org/realms/snomed/protocol/openid-connect/logout";

  const mockClientInstance = {
    authorizationUrl: vi.fn().mockReturnValue(MOCK_AUTH_URL),
    callbackParams: vi.fn().mockReturnValue({ code: "test-code" }),
    callback: vi.fn(),
    refresh: vi.fn(),
  };

  // IMPORTANT: @vitest/spy v4 requires that implementations used with `new`
  // must be a `function` or `class` declaration — NOT an arrow function.
  // vi.fn().mockReturnValue(x) stores `() => x` (arrow) as implementation,
  // which throws "not a constructor" when called via `new`. Using
  // vi.fn(function() { return x; }) passes a regular function instead.
  const MockClientConstructor = vi.fn(function MockClient() {
    return mockClientInstance;
  });

  const mockIssuer = {
    Client: MockClientConstructor,
    metadata: {
      issuer: "https://snoauth.example.org/realms/snomed",
      end_session_endpoint: MOCK_END_SESSION,
    },
  };

  return {
    MOCK_AUTH_URL,
    MOCK_END_SESSION,
    mockClientInstance,
    MockClientConstructor,
    mockIssuer,
  };
});

// ---------------------------------------------------------------------------
// Mock openid-client — factory now safely references hoisted variables
// ---------------------------------------------------------------------------

vi.mock("openid-client", () => ({
  Issuer: {
    discover: vi.fn().mockResolvedValue(mockIssuer),
  },
  generators: {
    state: vi.fn().mockReturnValue("mock-state"),
    nonce: vi.fn().mockReturnValue("mock-nonce"),
  },
}));

import { Issuer, generators } from "openid-client";
import type { TokenSet } from "openid-client";
import {
  buildAuthParams,
  buildLogoutUrl,
  exchangeCodeForTokens,
  initKeycloak,
  parseIdToken,
  refreshTokens,
} from "./keycloak.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock TokenSet for parseIdToken tests.
 * accessPayload is serialised as the JWT payload (base64url encoded).
 */
function makeTokenSet(
  idClaims: Record<string, unknown>,
  accessPayload: Record<string, unknown> = {},
): TokenSet {
  const payloadB64 = Buffer.from(JSON.stringify(accessPayload)).toString(
    "base64url",
  );
  const access_token = `header.${payloadB64}.sig`;

  return {
    claims: () => idClaims as unknown as ReturnType<TokenSet["claims"]>,
    access_token,
  } as unknown as TokenSet;
}

// ---------------------------------------------------------------------------
// parseIdToken — no openid-client state required, fully unit-testable
// ---------------------------------------------------------------------------

describe("parseIdToken()", () => {
  it("maps basic user fields from ID token claims", () => {
    const ts = makeTokenSet({
      sub: "user-123",
      email: "alice@example.com",
      name: "Alice Example",
      given_name: "Alice",
      family_name: "Example",
    });

    const user = parseIdToken(ts);
    expect(user.sub).toBe("user-123");
    expect(user.email).toBe("alice@example.com");
    expect(user.name).toBe("Alice Example");
    expect(user.given_name).toBe("Alice");
    expect(user.family_name).toBe("Example");
  });

  it("extracts realm groups from the ID token 'groups' claim", () => {
    const ts = makeTokenSet({
      sub: "u1",
      groups: ["/board-members", "secretariat"],
    });

    const user = parseIdToken(ts);
    expect(user.groups).toContain("/board-members");
    expect(user.groups).toContain("secretariat");
  });

  it("extracts client roles from resource_access in the access token", () => {
    const ts = makeTokenSet(
      { sub: "u1" },
      { resource_access: { quorum: { roles: ["portal_admin"] } } },
    );

    const user = parseIdToken(ts);
    expect(user.groups).toContain("portal_admin");
  });

  it("merges realm groups and client roles, de-duplicating", () => {
    const ts = makeTokenSet(
      { sub: "u1", groups: ["portal_admin", "/board-members"] },
      { resource_access: { quorum: { roles: ["portal_admin", "uploader"] } } },
    );

    const user = parseIdToken(ts);
    // portal_admin appears in both — should appear only once
    const countAdmin = user.groups.filter((g) => g === "portal_admin").length;
    expect(countAdmin).toBe(1);
    expect(user.groups).toContain("/board-members");
    expect(user.groups).toContain("uploader");
  });

  it("defaults missing optional claims to empty strings", () => {
    const ts = makeTokenSet({ sub: "u2" });
    const user = parseIdToken(ts);
    expect(user.email).toBe("");
    expect(user.name).toBe("");
    expect(user.given_name).toBe("");
    expect(user.family_name).toBe("");
  });

  it("returns empty groups array when neither claim is present", () => {
    const ts = makeTokenSet({ sub: "u3" }, {});
    const user = parseIdToken(ts);
    expect(user.groups).toEqual([]);
  });

  it("does not throw when access_token has a malformed payload", () => {
    const ts = {
      claims: () =>
        ({ sub: "u4" }) as unknown as ReturnType<TokenSet["claims"]>,
      access_token: "header.!!!invalid-base64!!.sig",
    } as unknown as TokenSet;

    expect(() => parseIdToken(ts)).not.toThrow();
    const user = parseIdToken(ts);
    expect(user.sub).toBe("u4");
    expect(user.groups).toEqual([]);
  });

  it("handles absent access_token gracefully (no client roles)", () => {
    const ts = {
      claims: () =>
        ({ sub: "u5", groups: ["/board"] }) as unknown as ReturnType<
          TokenSet["claims"]
        >,
      access_token: undefined,
    } as unknown as TokenSet;

    const user = parseIdToken(ts);
    expect(user.groups).toEqual(["/board"]);
  });

  it("does not include realm_access roles (only quorum client roles)", () => {
    const ts = makeTokenSet(
      { sub: "u6" },
      {
        realm_access: { roles: ["offline_access", "uma_authorization"] },
        resource_access: { quorum: { roles: ["portal_admin"] } },
      },
    );

    const user = parseIdToken(ts);
    expect(user.groups).not.toContain("offline_access");
    expect(user.groups).not.toContain("uma_authorization");
    expect(user.groups).toContain("portal_admin");
  });
});

// ---------------------------------------------------------------------------
// buildLogoutUrl — BEFORE initKeycloak (issuer is null → fallback)
// ---------------------------------------------------------------------------

describe("buildLogoutUrl() — before initKeycloak", () => {
  it("returns the postLogoutRedirectUri as fallback when issuer is not set", () => {
    const uri = "http://localhost:3000";
    const result = buildLogoutUrl(uri);
    // Issuer has not been initialised yet, so _issuer is null → fallback
    expect(result).toBe(uri);
  });
});

// ---------------------------------------------------------------------------
// After initKeycloak — requires mocked openid-client to be set up
// ---------------------------------------------------------------------------

describe("after initKeycloak()", () => {
  beforeAll(async () => {
    await initKeycloak();
  });

  describe("initKeycloak()", () => {
    it("calls Issuer.discover with the OIDC discovery URL", () => {
      expect(vi.mocked(Issuer.discover)).toHaveBeenCalledWith(
        expect.stringContaining(".well-known/openid-configuration"),
      );
    });

    it("creates a new Client via the discovered Issuer", () => {
      expect(MockClientConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: expect.any(String),
          redirect_uris: expect.any(Array),
          response_types: ["code"],
        }),
      );
    });

    it("is idempotent — calling twice does not re-discover the issuer", async () => {
      const callsBefore = vi.mocked(Issuer.discover).mock.calls.length;
      await initKeycloak(); // second call — should be a no-op
      const callsAfter = vi.mocked(Issuer.discover).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });
  });

  describe("buildAuthParams()", () => {
    it("returns state, nonce, and an authorizationUrl string", () => {
      const { state, nonce, authorizationUrl } = buildAuthParams();
      expect(typeof state).toBe("string");
      expect(state.length).toBeGreaterThan(0);
      expect(typeof nonce).toBe("string");
      expect(typeof authorizationUrl).toBe("string");
      expect(authorizationUrl.length).toBeGreaterThan(0);
    });

    it("delegates to generators.state and generators.nonce", () => {
      buildAuthParams();
      expect(vi.mocked(generators.state)).toHaveBeenCalled();
      expect(vi.mocked(generators.nonce)).toHaveBeenCalled();
    });

    it("calls client.authorizationUrl with scope openid profile email", () => {
      buildAuthParams();
      expect(mockClientInstance.authorizationUrl).toHaveBeenCalledWith(
        expect.objectContaining({ scope: "openid profile email" }),
      );
    });
  });

  describe("exchangeCodeForTokens()", () => {
    it("calls client.callbackParams with the callback URL", async () => {
      mockClientInstance.callback.mockResolvedValueOnce({
        id_token: "id",
        access_token: "at",
      } as never);

      await exchangeCodeForTokens(
        "http://localhost:3001/auth/callback?code=abc&state=xyz",
        "xyz",
        "nonce",
      );

      expect(mockClientInstance.callbackParams).toHaveBeenCalledWith(
        "http://localhost:3001/auth/callback?code=abc&state=xyz",
      );
    });

    it("returns the tokenSet from client.callback", async () => {
      const fakeTokenSet = { id_token: "id-token", access_token: "access" };
      mockClientInstance.callback.mockResolvedValueOnce(fakeTokenSet as never);

      const result = await exchangeCodeForTokens(
        "http://localhost:3001/auth/callback?code=abc",
        "state",
        "nonce",
      );
      expect(result).toBe(fakeTokenSet);
    });

    it("propagates errors from client.callback", async () => {
      mockClientInstance.callback.mockRejectedValueOnce(
        new Error("invalid state"),
      );

      await expect(
        exchangeCodeForTokens(
          "http://localhost:3001/auth/callback?code=bad",
          "wrong-state",
          "nonce",
        ),
      ).rejects.toThrow("invalid state");
    });
  });

  describe("refreshTokens()", () => {
    it("calls client.refresh with the provided refresh token", async () => {
      const newTokenSet = { access_token: "new-at", refresh_token: "new-rt" };
      mockClientInstance.refresh.mockResolvedValueOnce(newTokenSet as never);

      const result = await refreshTokens("old-refresh-token");
      expect(mockClientInstance.refresh).toHaveBeenCalledWith(
        "old-refresh-token",
      );
      expect(result).toBe(newTokenSet);
    });

    it("propagates errors from client.refresh (e.g. expired token)", async () => {
      mockClientInstance.refresh.mockRejectedValueOnce(
        new Error("token expired"),
      );
      await expect(refreshTokens("stale-token")).rejects.toThrow(
        "token expired",
      );
    });
  });

  describe("buildLogoutUrl() — after initKeycloak", () => {
    it("returns the full end_session_endpoint URL with encoded postLogoutRedirectUri", () => {
      const postLogoutUri = "http://localhost:3000";
      const result = buildLogoutUrl(postLogoutUri);

      expect(result).toContain(MOCK_END_SESSION);
      expect(result).toContain(encodeURIComponent(postLogoutUri));
    });
  });
});
