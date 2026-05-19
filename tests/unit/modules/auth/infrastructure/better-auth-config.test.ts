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
      Pool: jest.fn(() => ({ id: "pool" })),
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
        baseURL: {
          allowedHosts: ["tutribu.example.com"],
          fallback: "https://tutribu.example.com",
        },
        database: adapterInstance,
        socialProviders: {
          google: expect.objectContaining({
            overrideUserInfoOnSignIn: true,
          }),
        },
        trustedOrigins: ["https://tutribu.example.com"],
      })
    );
  });

  it("trusts configured and deployment preview origins for OAuth requests", async () => {
    const adapterInstance = { id: "adapter" };
    const databaseInstance = { id: "database" };
    const mockBetterAuth = jest.fn(() => ({ handler: {} }));
    const mockDrizzle = jest.fn(() => databaseInstance);
    const mockDrizzleAdapter = jest.fn(() => adapterInstance);
    const mockNextCookies = jest.fn(() => ({ id: "next-cookies-plugin" }));

    process.env.BETTER_AUTH_URL = "https://tutribu.example.com";
    process.env.BETTER_AUTH_TRUSTED_ORIGINS =
      "https://custom-preview.example.com/auth/signin";

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
      Pool: jest.fn(() => ({ id: "pool" })),
    }));
    jest.doMock("@/src/modules/shared/infrastructure/database/server-environment", () => ({
      getServerDatabaseEnvironment: () => ({
        connectionString: "postgres://tutribu.example.com/db",
      }),
    }));
    jest.doMock("@/src/modules/shared/infrastructure/database/schema", () => ({
      accounts: { name: "account-table" },
      sessions: { name: "session-table" },
      users: { name: "user-table" },
      verifications: { name: "verification-table" },
    }));

    await import("@/src/modules/auth/infrastructure/better-auth/auth");

    expect(mockBetterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: {
          allowedHosts: [
            "tutribu.example.com",
            "custom-preview.example.com",
          ],
          fallback: "https://tutribu.example.com",
        },
        trustedOrigins: [
          "https://tutribu.example.com",
          "https://custom-preview.example.com",
        ],
      })
    );
  });

  it("keeps configured wildcard origins available for OAuth requests", async () => {
    const adapterInstance = { id: "adapter" };
    const databaseInstance = { id: "database" };
    const mockBetterAuth = jest.fn(() => ({ handler: {} }));
    const mockDrizzle = jest.fn(() => databaseInstance);
    const mockDrizzleAdapter = jest.fn(() => adapterInstance);
    const mockNextCookies = jest.fn(() => ({ id: "next-cookies-plugin" }));

    process.env.BETTER_AUTH_URL = "https://tutribu.example.com";
    process.env.BETTER_AUTH_TRUSTED_ORIGINS =
      "*.preview.example.com, localhost:*";

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
      Pool: jest.fn(() => ({ id: "pool" })),
    }));
    jest.doMock("@/src/modules/shared/infrastructure/database/server-environment", () => ({
      getServerDatabaseEnvironment: () => ({
        connectionString: "postgres://tutribu.example.com/db",
      }),
    }));
    jest.doMock("@/src/modules/shared/infrastructure/database/schema", () => ({
      accounts: { name: "account-table" },
      sessions: { name: "session-table" },
      users: { name: "user-table" },
      verifications: { name: "verification-table" },
    }));

    await import("@/src/modules/auth/infrastructure/better-auth/auth");

    expect(mockBetterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: {
          allowedHosts: [
            "tutribu.example.com",
            "*.preview.example.com",
            "localhost:*",
          ],
          fallback: "https://tutribu.example.com",
        },
        trustedOrigins: [
          "https://tutribu.example.com",
          "https://*.preview.example.com",
          "http://localhost:*",
        ],
      })
    );
  });
});
