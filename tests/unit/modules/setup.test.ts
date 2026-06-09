import {
  createMaintenanceModules,
  createRequestModules,
} from "@/src/modules/setup";
import { getRequestAuthContext } from "@/src/modules/auth/infrastructure/better-auth/server-auth-context";
import {
  createServerDatabaseClient,
  DATABASE_CONNECTION_USAGE,
} from "@/src/modules/shared/infrastructure/database/server-database-client";

jest.mock("@/src/modules/shared/infrastructure/database/server-database-client", () => ({
  DATABASE_CONNECTION_USAGE: { maintenance: "maintenance", request: "request" },
  createServerDatabaseClient: jest.fn(),
}));

jest.mock("@/src/modules/auth/infrastructure/better-auth/server-auth-context", () => ({
  getRequestAuthContext: jest.fn(),
  getServerBetterAuthSession: jest.fn(async () => null),
}));

function buildDatabaseClientDouble() {
  return {
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
}

describe("createRequestModules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRequestAuthContext as jest.Mock).mockResolvedValue({
      email: "leader@example.com",
      userId: "member-1",
    });
    (createServerDatabaseClient as jest.Mock).mockResolvedValue(
      buildDatabaseClientDouble()
    );
  });

  it("creates a single request-scoped database client and shares it across modules", async () => {
    const databaseClient = buildDatabaseClientDouble();
    (createServerDatabaseClient as jest.Mock).mockResolvedValue(databaseClient);

    const modules = await createRequestModules();

    await modules.auth.useCases.getAuthenticatedMember();
    await modules.tribes.useCases.getTribeCreationEligibility({
      creatorEmail: "leader@example.com",
    });

    expect(createServerDatabaseClient).toHaveBeenCalledTimes(1);
    expect(createServerDatabaseClient).toHaveBeenCalledWith(
      DATABASE_CONNECTION_USAGE.request
    );
    expect(getRequestAuthContext).toHaveBeenCalledTimes(1);
    expect(databaseClient.withRequestContext).toHaveBeenCalled();
  });

  it("wires maintenance modules to the privileged maintenance connection", async () => {
    await createMaintenanceModules();

    expect(createServerDatabaseClient).toHaveBeenCalledTimes(1);
    expect(createServerDatabaseClient).toHaveBeenCalledWith(
      DATABASE_CONNECTION_USAGE.maintenance
    );
  });
});
