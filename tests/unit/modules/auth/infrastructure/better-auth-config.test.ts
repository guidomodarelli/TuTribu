/** @vitest-environment node */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
describe("Better Auth configuration", () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.BETTER_AUTH_SECRET = "test-secret";
    process.env.BETTER_AUTH_URL = "https://tutribu.example.com";
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("passes a resolvable auth schema to the Drizzle adapter", async () => {
    const adapterInstance = { id: "adapter" };
    const databaseInstance = { id: "database" };
    const mockBetterAuth = vi.fn(() => ({ handler: {} }));
    const mockDrizzle = vi.fn(() => databaseInstance);
    const mockDrizzleAdapter = vi.fn(() => adapterInstance);
    const mockNextCookies = vi.fn(() => ({ id: "next-cookies-plugin" }));
    const users = { name: "user-table" };
    const sessions = { name: "session-table" };
    const accounts = { name: "account-table" };
    const verifications = { name: "verification-table" };

    vi.doMock("better-auth", () => ({
      betterAuth: mockBetterAuth,
    }));
    vi.doMock("@better-auth/drizzle-adapter", () => ({
      drizzleAdapter: mockDrizzleAdapter,
    }));
    vi.doMock("better-auth/next-js", () => ({
      nextCookies: mockNextCookies,
    }));
    vi.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: mockDrizzle,
    }));
    vi.doMock("pg", () => ({
      Pool: vi.fn(function () { return ({ id: "pool", on: vi.fn() }); }),
    }));
    vi.doMock("@/src/modules/shared/infrastructure/database/server-environment", () => ({
      getServerDatabaseEnvironment: () => ({
        connectionString: "postgres://tutribu.example.com/db",
      }),
    }));
    vi.doMock("@/src/modules/shared/infrastructure/database/schema", () => ({
      accounts,
      sessions,
      users,
      verifications,
    }));
    vi.doMock(
      "@/src/modules/auth/infrastructure/composition/member-profile-image-refresh",
      () => ({
        scheduleMemberProfileImageRefresh: vi.fn(),
      })
    );

    await import("@/src/modules/auth/infrastructure/better-auth/auth");

    expect(mockDrizzleAdapter).toHaveBeenCalledWith(
      databaseInstance,
      expect.objectContaining({
        provider: "pg",
        schema: {
          account: accounts,
          session: sessions,
          user: users,
          verification: verifications,
        },
      })
    );
    expect(mockBetterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        database: adapterInstance,
        session: {
          expiresIn: 180 * 24 * 60 * 60,
          updateAge: 24 * 60 * 60,
        },
        socialProviders: {
          google: expect.objectContaining({
            accessType: "offline",
            overrideUserInfoOnSignIn: true,
            prompt: "consent",
          }),
        },
      })
    );
  });

  it("refreshes the member profile image when a session is renewed", async () => {
    const scheduleMemberProfileImageRefresh = vi.fn();
    const getAccessToken = vi
      .fn()
      .mockResolvedValue({ accessToken: "fresh-access-token" });
    let capturedConfiguration: {
      databaseHooks?: {
        session?: { update?: { after?: (session: unknown) => Promise<void> } };
      };
    } = {};
    const mockBetterAuth = vi.fn((configuration) => {
      capturedConfiguration = configuration;
      return { api: { getAccessToken } };
    });

    vi.doMock("better-auth", () => ({
      betterAuth: mockBetterAuth,
    }));
    vi.doMock("@better-auth/drizzle-adapter", () => ({
      drizzleAdapter: vi.fn(() => ({ id: "adapter" })),
    }));
    vi.doMock("better-auth/next-js", () => ({
      nextCookies: vi.fn(() => ({ id: "next-cookies-plugin" })),
    }));
    vi.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: vi.fn(() => ({ id: "database" })),
    }));
    vi.doMock("pg", () => ({
      Pool: vi.fn(function () { return ({ id: "pool", on: vi.fn() }); }),
    }));
    vi.doMock(
      "@/src/modules/shared/infrastructure/database/server-environment",
      () => ({
        getServerDatabaseEnvironment: () => ({
          connectionString: "postgres://tutribu.example.com/db",
        }),
      })
    );
    vi.doMock(
      "@/src/modules/auth/infrastructure/composition/member-profile-image-refresh",
      () => ({ scheduleMemberProfileImageRefresh })
    );

    await import("@/src/modules/auth/infrastructure/better-auth/auth");

    const afterHook = capturedConfiguration.databaseHooks?.session?.update?.after;
    expect(typeof afterHook).toBe("function");

    await afterHook?.({ userId: "member-1" });

    expect(scheduleMemberProfileImageRefresh).toHaveBeenCalledWith(
      "member-1",
      expect.any(Function)
    );

    const [, resolveAccessToken] =
      scheduleMemberProfileImageRefresh.mock.calls[0];
    await expect(resolveAccessToken("member-1")).resolves.toBe(
      "fresh-access-token"
    );
    expect(getAccessToken).toHaveBeenCalledWith({
      body: { providerId: "google", userId: "member-1" },
    });
  });

  it("propagates access token resolution failures to the profile refresh flow", async () => {
    const scheduleMemberProfileImageRefresh = vi.fn();
    const tokenResolutionError = new Error("token lookup failed");
    const getAccessToken = vi.fn().mockRejectedValue(tokenResolutionError);
    let capturedConfiguration: {
      databaseHooks?: {
        session?: { update?: { after?: (session: unknown) => Promise<void> } };
      };
    } = {};
    const mockBetterAuth = vi.fn((configuration) => {
      capturedConfiguration = configuration;
      return { api: { getAccessToken } };
    });

    vi.doMock("better-auth", () => ({
      betterAuth: mockBetterAuth,
    }));
    vi.doMock("@better-auth/drizzle-adapter", () => ({
      drizzleAdapter: vi.fn(() => ({ id: "adapter" })),
    }));
    vi.doMock("better-auth/next-js", () => ({
      nextCookies: vi.fn(() => ({ id: "next-cookies-plugin" })),
    }));
    vi.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: vi.fn(() => ({ id: "database" })),
    }));
    vi.doMock("pg", () => ({
      Pool: vi.fn(function () { return ({ id: "pool", on: vi.fn() }); }),
    }));
    vi.doMock(
      "@/src/modules/shared/infrastructure/database/server-environment",
      () => ({
        getServerDatabaseEnvironment: () => ({
          connectionString: "postgres://tutribu.example.com/db",
        }),
      })
    );
    vi.doMock(
      "@/src/modules/auth/infrastructure/composition/member-profile-image-refresh",
      () => ({ scheduleMemberProfileImageRefresh })
    );

    await import("@/src/modules/auth/infrastructure/better-auth/auth");

    const afterHook = capturedConfiguration.databaseHooks?.session?.update?.after;
    await afterHook?.({ userId: "member-1" });

    const [, resolveAccessToken] =
      scheduleMemberProfileImageRefresh.mock.calls[0];
    await expect(resolveAccessToken("member-1")).rejects.toThrow(
      tokenResolutionError
    );
  });
});
