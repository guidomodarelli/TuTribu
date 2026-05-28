/** @jest-environment node */

describe("Better Auth configuration", () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
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
    const mockBetterAuth = jest.fn(() => ({ handler: {} }));
    const mockDrizzle = jest.fn(() => databaseInstance);
    const mockDrizzleAdapter = jest.fn(() => adapterInstance);
    const mockNextCookies = jest.fn(() => ({ id: "next-cookies-plugin" }));
    const users = { name: "user-table" };
    const sessions = { name: "session-table" };
    const accounts = { name: "account-table" };
    const verifications = { name: "verification-table" };

    jest.doMock("better-auth", () => ({
      betterAuth: (...args: unknown[]) => mockBetterAuth(...args),
    }));
    jest.doMock("@better-auth/drizzle-adapter", () => ({
      drizzleAdapter: (...args: unknown[]) => mockDrizzleAdapter(...args),
    }));
    jest.doMock("better-auth/next-js", () => ({
      nextCookies: (...args: unknown[]) => mockNextCookies(...args),
    }));
    jest.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: (...args: unknown[]) => mockDrizzle(...args),
    }));
    jest.doMock("pg", () => ({
      Pool: jest.fn(() => ({ id: "pool", on: jest.fn() })),
    }));
    jest.doMock("@/src/modules/shared/infrastructure/database/server-environment", () => ({
      getServerDatabaseEnvironment: () => ({
        connectionString: "postgres://tutribu.example.com/db",
      }),
    }));
    jest.doMock("@/src/modules/shared/infrastructure/database/schema", () => ({
      accounts,
      sessions,
      users,
      verifications,
    }));
    jest.doMock(
      "@/src/modules/auth/infrastructure/composition/member-profile-image-refresh",
      () => ({
        scheduleMemberProfileImageRefresh: jest.fn(),
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
    const scheduleMemberProfileImageRefresh = jest.fn();
    const getAccessToken = jest
      .fn()
      .mockResolvedValue({ accessToken: "fresh-access-token" });
    let capturedConfiguration: {
      databaseHooks?: {
        session?: { update?: { after?: (session: unknown) => Promise<void> } };
      };
    } = {};
    const mockBetterAuth = jest.fn((configuration) => {
      capturedConfiguration = configuration;
      return { api: { getAccessToken } };
    });

    jest.doMock("better-auth", () => ({
      betterAuth: (...args: unknown[]) => mockBetterAuth(...args),
    }));
    jest.doMock("@better-auth/drizzle-adapter", () => ({
      drizzleAdapter: jest.fn(() => ({ id: "adapter" })),
    }));
    jest.doMock("better-auth/next-js", () => ({
      nextCookies: jest.fn(() => ({ id: "next-cookies-plugin" })),
    }));
    jest.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: jest.fn(() => ({ id: "database" })),
    }));
    jest.doMock("pg", () => ({
      Pool: jest.fn(() => ({ id: "pool", on: jest.fn() })),
    }));
    jest.doMock(
      "@/src/modules/shared/infrastructure/database/server-environment",
      () => ({
        getServerDatabaseEnvironment: () => ({
          connectionString: "postgres://tutribu.example.com/db",
        }),
      })
    );
    jest.doMock(
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
    const scheduleMemberProfileImageRefresh = jest.fn();
    const tokenResolutionError = new Error("token lookup failed");
    const getAccessToken = jest.fn().mockRejectedValue(tokenResolutionError);
    let capturedConfiguration: {
      databaseHooks?: {
        session?: { update?: { after?: (session: unknown) => Promise<void> } };
      };
    } = {};
    const mockBetterAuth = jest.fn((configuration) => {
      capturedConfiguration = configuration;
      return { api: { getAccessToken } };
    });

    jest.doMock("better-auth", () => ({
      betterAuth: (...args: unknown[]) => mockBetterAuth(...args),
    }));
    jest.doMock("@better-auth/drizzle-adapter", () => ({
      drizzleAdapter: jest.fn(() => ({ id: "adapter" })),
    }));
    jest.doMock("better-auth/next-js", () => ({
      nextCookies: jest.fn(() => ({ id: "next-cookies-plugin" })),
    }));
    jest.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: jest.fn(() => ({ id: "database" })),
    }));
    jest.doMock("pg", () => ({
      Pool: jest.fn(() => ({ id: "pool", on: jest.fn() })),
    }));
    jest.doMock(
      "@/src/modules/shared/infrastructure/database/server-environment",
      () => ({
        getServerDatabaseEnvironment: () => ({
          connectionString: "postgres://tutribu.example.com/db",
        }),
      })
    );
    jest.doMock(
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
