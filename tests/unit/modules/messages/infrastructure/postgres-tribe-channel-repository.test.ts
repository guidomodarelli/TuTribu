import { createKyselyRequestDatabase } from "@/src/modules/shared/infrastructure/database/kysely-request-database";
import { PostgresTribeChannelRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-tribe-channel-repository";

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
  return getExecutedSqlStatements(databaseDouble).join("\n");
}

function getExecutedSqlStatements(databaseDouble: {
  query: jest.Mock;
}): string[] {
  return databaseDouble.query.mock.calls
    .map(([statement]) => String(statement))
    .filter((statement) => !isTransactionControlStatement(statement));
}

describe("PostgresTribeChannelRepository", () => {
  it("lists tribe channels ordered for the round", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [
        {
          access_scope: "tribemates",
          emoji: "🔥",
          id: "channel-ronda",
          name: "Ronda",
          slug: "ronda",
          sort_order: "20",
        },
      ],
    ]);
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.listByTribeSlug({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual([
      {
        accessScope: "tribemates",
        emoji: "🔥",
        id: "channel-ronda",
        name: "Ronda",
        slug: "ronda",
        sortOrder: 20,
      },
    ]);

    expect(getExecutedSqlText(databaseDouble)).toContain(
      'order by "tribe_channels"."sort_order" asc'
    );
  });

  it("creates channels guarded by leader or guardian membership", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ can_manage: true }],
      [],
      [{ sort_order: 20 }],
      [
        {
          access_scope: "tribemates",
          emoji: "❓",
          id: "channel-questions",
          name: "Preguntas",
          slug: "preguntas",
          sort_order: 30,
        },
      ],
    ]);
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.create({
        tribeSlug: "matematica-pro",
        emoji: "❓",
        name: "Preguntas",
      })
    ).resolves.toMatchObject({
      channel: {
        id: "channel-questions",
        slug: "preguntas",
      },
      status: "created",
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain("public.can_manage_tribe_channels");
    expect(sqlText).toContain('insert into "tribe_channels"');
    expect(sqlText).toContain('"slug" = $');
  });

  it("keeps channel creation guarded by mutation-time management permission", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ can_manage: true }],
      [],
      [{ sort_order: 20 }],
      [
        {
          access_scope: "tribemates",
          emoji: "❓",
          id: "channel-questions",
          name: "Preguntas",
          slug: "preguntas",
          sort_order: 30,
        },
      ],
    ]);
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await repository.create({
      tribeSlug: "matematica-pro",
      emoji: "❓",
      name: "Preguntas",
    });

    const insertStatement = getExecutedSqlStatements(databaseDouble).find(
      (statement) => statement.includes('insert into "tribe_channels"')
    );

    expect(insertStatement).toContain("public.can_manage_tribe_channels");
  });

  it("maps duplicate channel slugs to a controlled creation status", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ can_manage: true }],
      [{ id: "channel-ronda" }],
    ]);
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.create({
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Ronda",
      })
    ).resolves.toEqual({ status: "duplicate_slug" });
  });

  it("maps unique violations to duplicate_slug during channel creation", async () => {
    const databaseDouble = createFailingRequestKyselyDatabaseDouble({
      code: "23505",
      constraint: "tribe_channels_tribe_id_slug_key",
    });
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.create({
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Ronda",
      })
    ).resolves.toEqual({ status: "duplicate_slug" });
  });

  it("maps duplicate channel slugs to a controlled update status", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ can_manage: true }],
      [{ id: "channel-questions" }],
      [{ id: "channel-ronda" }],
    ]);
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.update({
        channelId: "channel-questions",
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Ronda",
        sortOrder: 30,
      })
    ).resolves.toEqual({ status: "duplicate_slug" });

    expect(getExecutedSqlText(databaseDouble)).toContain('"id" <> $');
  });

  it("maps unique violations to duplicate_slug during channel updates", async () => {
    const databaseDouble = createFailingRequestKyselyDatabaseDouble({
      code: "23505",
      constraint: "tribe_channels_tribe_id_slug_key",
    });
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.update({
        channelId: "channel-questions",
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Ronda",
        sortOrder: 30,
      })
    ).resolves.toEqual({ status: "duplicate_slug" });
  });

  it("returns not_found when updating a channel that does not exist", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ can_manage: true }],
      [],
    ]);
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.update({
        channelId: "channel-missing",
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Ronda",
        sortOrder: 30,
      })
    ).resolves.toEqual({ status: "not_found" });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain('from "tribe_channels"');
    expect(sqlText).toContain('"id" = $');
  });

  it("moves messages before deleting a channel when a target is provided", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ id: "channel-questions", tribe_id: "tribe-1" }],
      [{ can_manage: true }],
      [{ channel_count: "2" }],
      [{ message_count: "1" }],
      [{ id: "channel-ronda", tribe_id: "tribe-1" }],
      [{ id: "message-1" }],
      [{ id: "channel-questions" }],
    ]);
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.delete({
        channelId: "channel-questions",
        tribeSlug: "matematica-pro",
        targetChannelId: "channel-ronda",
      })
    ).resolves.toEqual({ status: "moved_and_deleted" });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain('update "messages"');
    expect(sqlText).toContain('delete from "tribe_channels"');
    expect(sqlText).toContain("channel_count");
  });
});
