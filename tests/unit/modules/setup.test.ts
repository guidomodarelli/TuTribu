import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import {
  createMaintenanceModules,
  createRequestModules,
} from "@/src/modules/setup";
import { getRequestAuthContext } from "@/src/modules/auth/infrastructure/better-auth/server-auth-context";
import {
  createServerDatabaseClient,
  DATABASE_CONNECTION_USAGE,
} from "@/src/modules/shared/infrastructure/database/server-database-client";

vi.mock("@/src/modules/shared/infrastructure/database/server-database-client", () => ({
  DATABASE_CONNECTION_USAGE: { maintenance: "maintenance", request: "request" },
  createServerDatabaseClient: vi.fn(),
}));

vi.mock("@/src/modules/auth/infrastructure/better-auth/server-auth-context", () => ({
  getRequestAuthContext: vi.fn(),
  getServerBetterAuthSession: vi.fn(async () => null),
}));

function buildDatabaseClientDouble() {
  return {
    withRequestContext: vi.fn(async (_context, callback) =>
      callback({
        execute: vi.fn(async () => ({
          rows: [],
        })),
        one: vi.fn(),
        query: vi.fn(),
        transaction: vi.fn(),
      })
    ),
    select: vi.fn(),
    transaction: vi.fn(),
  };
}

describe("createRequestModules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getRequestAuthContext as Mock).mockResolvedValue({
      email: "leader@example.com",
      userId: "member-1",
    });
    (createServerDatabaseClient as Mock).mockResolvedValue(
      buildDatabaseClientDouble()
    );
  });

  it("creates a single request-scoped database client and shares it across modules", async () => {
    const databaseClient = buildDatabaseClientDouble();
    (createServerDatabaseClient as Mock).mockResolvedValue(databaseClient);

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
