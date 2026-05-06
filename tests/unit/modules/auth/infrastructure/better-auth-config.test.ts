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
        database: adapterInstance,
      })
    );
  });
});
