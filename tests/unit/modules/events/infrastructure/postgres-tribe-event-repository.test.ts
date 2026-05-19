import { PostgresTribeEventRepository } from "@/src/modules/events/infrastructure/repositories/postgres-tribe-event-repository";
import { createKyselyRequestDatabase } from "@/src/modules/shared/infrastructure/database/kysely-request-database";

function createRequestKyselyDatabaseDouble(
  rowBatches: Array<Array<Record<string, unknown>>>
) {
  const query = jest.fn(async () => {
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

function getExecutedSqlText(databaseDouble: {
  query: jest.Mock;
}): string {
  return databaseDouble.query.mock.calls
    .map(([statement]) => String(statement))
    .join("\n");
}

describe("PostgresTribeEventRepository", () => {
  it("lists tribe events with viewer management permissions", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ canManageEvents: true }],
      [
        {
          description: "Repaso mensual",
          ends_at: "2026-05-06T19:00:00.000Z",
          id: "event-1",
          meeting_url: "https://meet.google.com/abc-defg-hij",
          starts_at: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        },
      ],
    ]);
    const repository = new PostgresTribeEventRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.listByTribeMonth({
        monthEnd: "2026-06-01T03:00:00.000Z",
        monthStart: "2026-05-01T03:00:00.000Z",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      events: [
        {
          description: "Repaso mensual",
          endsAt: "2026-05-06T19:00:00.000Z",
          id: "event-1",
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          startsAt: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        },
      ],
      viewerPermissions: {
        canManageEvents: true,
      },
    });

    expect(databaseDouble.query).toHaveBeenCalledTimes(3);
    expect(getExecutedSqlText(databaseDouble)).toContain(
      "public.can_manage_tribe_events"
    );
  });

  it("keeps viewer management permissions when the month has no events", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ canManageEvents: true }],
      [],
    ]);
    const repository = new PostgresTribeEventRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.listByTribeMonth({
        monthEnd: "2026-06-01T03:00:00.000Z",
        monthStart: "2026-05-01T03:00:00.000Z",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      events: [],
      viewerPermissions: {
        canManageEvents: true,
      },
    });
  });

  it("creates events guarded by leader or guardian membership", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ canManageEvents: true }],
      [
        {
          description: null,
          ends_at: null,
          id: "event-1",
          meeting_url: "https://meet.google.com/abc-defg-hij",
          starts_at: "2026-05-06T18:00:00.000Z",
          status: "created",
          title: "Clase abierta",
        },
      ],
    ]);
    const repository = new PostgresTribeEventRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.create({
        description: null,
        endsAt: null,
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      event: {
        id: "event-1",
        title: "Clase abierta",
      },
      status: "created",
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain('insert into "events"');
    expect(sqlText).toContain("public.current_app_user_id");
    expect(sqlText).toContain("public.can_manage_tribe_events");
  });

  it("updates events guarded by tribe event management permissions", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ id: "event-1" }],
      [{ canManageEvents: true }],
      [
        {
          description: "Repaso actualizado",
          ends_at: "2026-05-06T20:00:00.000Z",
          id: "event-1",
          meeting_url: "https://meet.google.com/updated",
          starts_at: "2026-05-06T18:30:00.000Z",
          title: "Clase actualizada",
        },
      ],
    ]);
    const repository = new PostgresTribeEventRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.update({
        description: "Repaso actualizado",
        endsAt: "2026-05-06T20:00:00.000Z",
        eventId: "event-1",
        meetingUrl: "https://meet.google.com/updated",
        startsAt: "2026-05-06T18:30:00.000Z",
        title: "Clase actualizada",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      event: {
        id: "event-1",
        title: "Clase actualizada",
      },
      status: "updated",
    });

    expect(getExecutedSqlText(databaseDouble)).toContain('update "events"');
  });

  it("deletes events guarded by tribe event management permissions", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ id: "event-1" }],
      [{ canManageEvents: true }],
      [{ id: "event-1" }],
    ]);
    const repository = new PostgresTribeEventRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.delete({
        eventId: "event-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "deleted",
    });

    expect(getExecutedSqlText(databaseDouble)).toContain('delete from "events"');
  });
});
