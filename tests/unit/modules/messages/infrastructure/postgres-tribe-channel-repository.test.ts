import { vi, describe, it, expect } from "vitest";
import { PostgresTribeChannelRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-tribe-channel-repository";


describe("PostgresTribeChannelRepository", () => {
  it("lists tribe channels ordered for the round", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          access_scope: "tribemates",
          emoji: "🔥",
          id: "channel-ronda",
          name: "Ronda",
          slug: "ronda",
          sort_order: "20",
        },
      ],
    }); });
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback({ execute } as never)
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

  });

  it("creates channels guarded by leader or guardian membership", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          access_scope: "tribemates",
          emoji: "❓",
          id: "channel-questions",
          name: "Preguntas",
          slug: "preguntas",
          sort_order: 30,
          status: "created" as const,
        },
      ],
    }); });
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback({ execute } as never)
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
      status: "created" as const,
    });


  });

  it("maps duplicate channel slugs to a controlled creation status", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          status: "duplicate_slug" as const,
        },
      ],
    }); });
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Ronda",
      })
    ).resolves.toEqual({ status: "duplicate_slug" as const });
  });

  it("maps unique violations to duplicate_slug during channel creation", async () => {
    const execute = vi.fn(async (...args: unknown[]) => { void args;
      throw {
        code: "23505",
        constraint: "tribe_channels_tribe_id_slug_key",
      };
    });
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Ronda",
      })
    ).resolves.toEqual({ status: "duplicate_slug" as const });
  });

  it("maps duplicate channel slugs to a controlled update status", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          status: "duplicate_slug" as const,
        },
      ],
    }); });
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.update({
        channelId: "channel-questions",
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Ronda",
        sortOrder: 30,
      })
    ).resolves.toEqual({ status: "duplicate_slug" as const });

  });

  it("maps unique violations to duplicate_slug during channel updates", async () => {
    const execute = vi.fn(async (...args: unknown[]) => { void args;
      throw {
        code: "23505",
        constraint: "tribe_channels_tribe_id_slug_key",
      };
    });
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.update({
        channelId: "channel-questions",
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Ronda",
        sortOrder: 30,
      })
    ).resolves.toEqual({ status: "duplicate_slug" as const });
  });

  it("returns not_found when updating a channel that does not exist", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          status: "not_found" as const,
        },
      ],
    }); });
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.update({
        channelId: "channel-missing",
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Ronda",
        sortOrder: 30,
      })
    ).resolves.toEqual({ status: "not_found" as const });


  });

  it("moves messages before deleting a channel when a target is provided", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          status: "moved_and_deleted" as const,
        },
      ],
    }); });
    const repository = new PostgresTribeChannelRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.delete({
        channelId: "channel-questions",
        tribeSlug: "matematica-pro",
        targetChannelId: "channel-ronda",
      })
    ).resolves.toEqual({ status: "moved_and_deleted" as const });


  });
});
