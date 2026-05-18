import { PostgresTribeInvitationRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-invitation-repository";
import { createKyselyRequestDatabase } from "@/src/modules/shared/infrastructure/database/kysely-request-database";

function getSqlText(statement: unknown): string {
  if (typeof statement === "string") {
    return statement;
  }

  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      return "";
    })
    .join("");
}

function createRequestKyselyDatabaseDouble(
  rowBatches: Array<Array<Record<string, unknown>>>
) {
  const query = jest.fn(async (statement: string) => {
    if (isTransactionControlStatement(statement)) {
      return {
        rowCount: 0,
        rows: [],
      };
    }

    const rows = rowBatches.shift() ?? [];

    return {
      rowCount: rows.length,
      rows,
    };
  });

  return {
    database: {
      kysely: createKyselyRequestDatabase({
        query,
      } as never),
    },
    query,
  };
}

function isTransactionControlStatement(statement: string): boolean {
  return (
    statement.startsWith("SAVEPOINT") ||
    statement.startsWith("RELEASE SAVEPOINT") ||
    statement.startsWith("ROLLBACK TO SAVEPOINT")
  );
}

function getExecutedSqlText(databaseDouble: {
  query: jest.Mock;
}): string {
  return databaseDouble.query.mock.calls
    .map(([statement]) => getSqlText(statement))
    .filter((statement) => !isTransactionControlStatement(statement))
    .join("\n");
}

function getExecutedParameters(databaseDouble: {
  query: jest.Mock;
}): unknown[] {
  return databaseDouble.query.mock.calls.flatMap(([, parameters]) =>
    Array.isArray(parameters) ? parameters : []
  );
}

function createFailingRequestKyselyDatabaseDouble(error: unknown) {
  const query = jest.fn(async () => {
    throw error;
  });

  return {
    database: {
      kysely: createKyselyRequestDatabase({
        query,
      } as never),
    },
    query,
  };
}

const FORBIDDEN_INVITATION_TOKEN_CONTEXT_SETTING = [
  "current",
  "invitation",
  "token",
].join("_");

describe("PostgresTribeInvitationRepository", () => {
  it("creates invitations with a one-time visible token, token hash, and manager permission guard", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ can_manage: true }],
      [{
        created_at: "2026-04-26T07:00:00.000Z",
        created_by: "user-1",
        id: "invitation-1",
      }],
      [{ name: "Grace Hopper" }],
    ]);
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.create({
        baseUrl: "https://tutribu.example.com",
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      invitationUrl: "https://tutribu.example.com/tribu/matematica-pro/invitar/plain-token",
      status: "created",
    });

    const sqlText = getExecutedSqlText(databaseDouble);
    const queryParameters = getExecutedParameters(databaseDouble);

    expect(sqlText).toContain("public.can_manage_tribe_invitations");
    expect(sqlText).toContain("token_hash");
    expect(sqlText).not.toContain("plain-token");
    expect(sqlText).not.toContain("plain-token");
    expect(queryParameters).not.toContain("plain-token");
  });

  it("maps missing invitation storage during creation to setup_required", async () => {
    const databaseDouble = createFailingRequestKyselyDatabaseDouble({
        cause: {
          code: "42P01",
        },
    });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.create({
        baseUrl: "https://tutribu.example.com",
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "setup_required" });
  });

  it("lists active invitations without exposing acceptance links for managers", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{
        created_at: "2026-04-26T07:00:00.000Z",
        created_by_name: "Grace Hopper",
        id: "550e8400-e29b-41d4-a716-446655440000",
      }],
    ]);
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual([
        {
          createdAt: "2026-04-26T07:00:00.000Z",
          createdByName: "Grace Hopper",
          id: "550e8400-e29b-41d4-a716-446655440000",
          invitationUrl: null,
        },
      ]);

    const sqlText = getSqlText(databaseDouble.query.mock.calls[0]?.[0]);

    expect(sqlText).toContain("\"tribe_invitations\".\"status\"");
    expect(sqlText).not.toContain("tribe_invitations.token");
    expect(sqlText).toContain("public.can_manage_tribe_invitations");
  });

  it("returns an empty list when invitation storage has not been migrated yet", async () => {
    const databaseDouble = createFailingRequestKyselyDatabaseDouble({
        cause: {
          code: "42P01",
        },
    });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual([]);
  });

  it("revokes active invitations with manager permission guard", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ can_manage: true }],
      [{ id: "550e8400-e29b-41d4-a716-446655440000" }],
      [{ id: "550e8400-e29b-41d4-a716-446655440000" }],
    ]);
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.revoke({
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "revoked" });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain("update \"tribe_invitations\"");
    expect(sqlText).toContain("\"status\" =");
    expect(sqlText).toContain("revoked_at");
  });

  it("maps malformed invitation identifiers to not_found before querying Postgres", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([]);
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.revoke({
        invitationId: "not-a-uuid",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "not_found" });

    expect(databaseDouble.query).not.toHaveBeenCalled();
  });

  it("accepts invitations idempotently without persisting the plain token", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ context: "" }],
      [{
        id: "invitation-1",
        status: "active",
        tribe_id: "tribe-1",
      }],
      [{ id: "tribe-1" }],
      [{ id: "user-1" }],
      [],
      [],
      [{ id: "membership-1" }],
      [{ status: "active", status_reason: "none" }],
    ]);
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.accept({
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "accepted" });

    const sqlText = getExecutedSqlText(databaseDouble);
    const queryParameters = getExecutedParameters(databaseDouble);

    expect(sqlText).toContain("on conflict (\"tribe_id\", \"user_id\") do nothing");
    expect(queryParameters).toContain("app.current_invitation_hash");
    expect(sqlText).not.toContain(FORBIDDEN_INVITATION_TOKEN_CONTEXT_SETTING);
    expect(sqlText).not.toContain("plain-token");
    expect(queryParameters).not.toContain("plain-token");
  });

  it("rechecks membership after insert conflicts so concurrent accepts stay idempotent", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ context: "" }],
      [{
        id: "invitation-1",
        status: "active",
        tribe_id: "tribe-1",
      }],
      [{ id: "tribe-1" }],
      [{ id: "user-1" }],
      [],
      [],
      [],
      [{ status: "active", status_reason: "none" }],
    ]);
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.accept({
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "accepted" });

    const sqlText = getExecutedSqlText(databaseDouble);
    const insertConflictPosition = sqlText.indexOf(
      "on conflict (\"tribe_id\", \"user_id\") do nothing"
    );
    const lastMembershipLookupPosition = sqlText.lastIndexOf(
      "from \"tribe_members\""
    );

    expect(insertConflictPosition).toBeGreaterThan(-1);
    expect(lastMembershipLookupPosition).toBeGreaterThan(insertConflictPosition);
  });

  it("maps revoked invitation acceptance to a controlled result", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ context: "" }],
      [{
        id: "invitation-1",
        status: "revoked",
        tribe_id: "tribe-1",
      }],
      [{ id: "tribe-1" }],
      [{ id: "user-1" }],
      [],
      [],
    ]);
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.accept({
        token: "revoked-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "revoked" });
  });

  it("does not require subscription checkout for revoked invitations", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ context: "" }],
      [{
        id: "invitation-1",
        status: "revoked",
        tribe_id: "tribe-1",
      }],
      [{ id: "tribe-1" }],
      [{ id: "user-1" }],
      [],
      [],
    ]);
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.accept({
        token: "revoked-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "revoked" });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain("from \"tribe_subscription_prices\"");
    expect(sqlText).not.toContain("insert into \"tribe_members\"");
  });

  it("resolves revoked invitations before requiring visible tribe access", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ context: "" }],
      [{
        id: "invitation-1",
        status: "revoked",
        tribe_id: "tribe-1",
      }],
      [],
      [{ id: "user-1" }],
    ]);
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.accept({
        token: "revoked-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "revoked" });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain("from \"tribe_invitations\"");
    expect(sqlText).toContain("from \"tribes\"");
    expect(sqlText).not.toContain("from \"tribe_subscription_prices\"");
    expect(sqlText).not.toContain("insert into \"tribe_members\"");
  });

  it("returns the current active subscription offer for an active invitation", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ context: "" }],
      [{
        amount_cents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      }],
    ]);
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.getSubscriptionOffer({
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      price: {
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: "available",
    });
  });

  it("returns unavailable when the invitation has no active current subscription offer", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ context: "" }],
      [],
    ]);
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.getSubscriptionOffer({
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "unavailable" });
  });
});
