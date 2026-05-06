import { PostgresTribeEventRepository } from "@/src/modules/events/infrastructure/repositories/postgres-tribe-event-repository";

function getSqlText(statement: unknown): string {
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

describe("PostgresTribeEventRepository", () => {
  it("lists tribe events with viewer management permissions", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          can_manage_events: true,
          description: "Repaso mensual",
          ends_at: "2026-05-06T19:00:00.000Z",
          id: "event-1",
          meeting_url: "https://meet.google.com/abc-defg-hij",
          starts_at: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        },
      ],
    }));
    const repository = new PostgresTribeEventRepository(async (callback) =>
      callback({ execute } as never)
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

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("public.can_manage_tribe_events");
    expect(sqlText).toContain("events.starts_at >= ");
    expect(sqlText).toContain("events.starts_at < ");
    expect(sqlText).toContain("order by event_rows.starts_at asc");
  });

  it("keeps viewer management permissions when the month has no events", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          can_manage_events: true,
          description: null,
          ends_at: null,
          id: null,
          meeting_url: null,
          starts_at: null,
          title: null,
        },
      ],
    }));
    const repository = new PostgresTribeEventRepository(async (callback) =>
      callback({ execute } as never)
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
    const execute = jest.fn(async () => ({
      rows: [
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
    }));
    const repository = new PostgresTribeEventRepository(async (callback) =>
      callback({ execute } as never)
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

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("insert into public.events");
    expect(sqlText).toContain("public.can_manage_tribe_events");
  });
});
