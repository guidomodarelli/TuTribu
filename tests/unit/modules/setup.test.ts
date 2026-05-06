import { createRequestModules } from "@/src/modules/setup";
import { getRequestAuthContext } from "@/src/modules/auth/infrastructure/better-auth/server-auth-context";
import { createServerDatabaseClient } from "@/src/modules/shared/infrastructure/database/server-database-client";

jest.mock("@/src/modules/shared/infrastructure/database/server-database-client", () => ({
  createServerDatabaseClient: jest.fn(),
}));

jest.mock("@/src/modules/auth/infrastructure/better-auth/server-auth-context", () => ({
  getRequestAuthContext: jest.fn(),
  getServerBetterAuthSession: jest.fn(async () => null),
}));

describe("createRequestModules", () => {
  it("creates a single request-scoped database client and shares it across modules", async () => {
    const databaseClient = {
      withRequestContext: jest.fn(async (_context, callback) =>
        callback({
          execute: jest.fn(async () => ({
            rows: [],
          })),
          one: jest.fn(),
          query: jest.fn(),
          transaction: jest.fn(),
        })
      ),
      select: jest.fn(),
      transaction: jest.fn(),
    };

    (getRequestAuthContext as jest.Mock).mockResolvedValue({
      email: "owner@example.com",
      userId: "member-1",
    });
    (createServerDatabaseClient as jest.Mock).mockResolvedValue(databaseClient);

    const modules = await createRequestModules();

    await modules.auth.useCases.getAuthenticatedMember();
    await modules.tribes.useCases.getTribeCreationEligibility({
      creatorEmail: "owner@example.com",
    });

    expect(createServerDatabaseClient).toHaveBeenCalledTimes(1);
    expect(getRequestAuthContext).toHaveBeenCalledTimes(1);
    expect(databaseClient.withRequestContext).toHaveBeenCalled();
  });
});
