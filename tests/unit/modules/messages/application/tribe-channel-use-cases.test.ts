import { vi, describe, it, expect } from "vitest";
import {
  createTribeChannel,
  deleteTribeChannel,
  updateTribeChannel,
} from "@/src/modules/messages/application/use-cases/manage-tribe-channels-use-cases";

describe("channel use cases", () => {
  const channel = {
    accessScope: "tribemates" as const,
    emoji: "🔥",
    id: "channel-ronda",
    name: "Ronda",
    slug: "ronda",
    sortOrder: 20,
  };

  it("creates a channel when the name and emoji are valid", async () => {
    const create = vi.fn(async () => ({
      channel,
      status: "created" as const,
    }));
    const execute = createTribeChannel({
      tribeChannelRepository: {
        create,
        delete: vi.fn(),
        listByTribeSlug: vi.fn(),
        update: vi.fn(),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        emoji: " 🔥 ",
        name: " Ronda ",
      })
    ).resolves.toEqual({ channel, status: "created" as const });
    expect(create).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      emoji: "🔥",
      name: "Ronda",
    });
  });

  it("creates a channel with a compound emoji", async () => {
    const create = vi.fn(async () => ({
      channel: {
        ...channel,
        emoji: "👨‍👩‍👧‍👦",
      },
      status: "created" as const,
    }));
    const execute = createTribeChannel({
      tribeChannelRepository: {
        create,
        delete: vi.fn(),
        listByTribeSlug: vi.fn(),
        update: vi.fn(),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        emoji: " 👨‍👩‍👧‍👦 ",
        name: "Familia",
      })
    ).resolves.toEqual({
      channel: {
        ...channel,
        emoji: "👨‍👩‍👧‍👦",
      },
      status: "created" as const,
    });
    expect(create).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      emoji: "👨‍👩‍👧‍👦",
      name: "Familia",
    });
  });

  it("creates a channel with a keycap emoji selected from the picker", async () => {
    const create = vi.fn(async () => ({
      channel: {
        ...channel,
        emoji: "1️⃣",
      },
      status: "created" as const,
    }));
    const execute = createTribeChannel({
      tribeChannelRepository: {
        create,
        delete: vi.fn(),
        listByTribeSlug: vi.fn(),
        update: vi.fn(),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        emoji: " 1️⃣ ",
        name: "Numeros",
      })
    ).resolves.toEqual({
      channel: {
        ...channel,
        emoji: "1️⃣",
      },
      status: "created" as const,
    });
    expect(create).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      emoji: "1️⃣",
      name: "Numeros",
    });
  });

  it("updates a channel with a symbol keycap emoji selected from the picker", async () => {
    const update = vi.fn(async () => ({
      channel: {
        ...channel,
        emoji: "#️⃣",
      },
      status: "updated" as const,
    }));
    const execute = updateTribeChannel({
      tribeChannelRepository: {
        create: vi.fn(),
        delete: vi.fn(),
        listByTribeSlug: vi.fn(),
        update,
      },
    });

    await expect(
      execute({
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        emoji: " #️⃣ ",
        name: "Ronda",
        sortOrder: 20,
      })
    ).resolves.toEqual({
      channel: {
        ...channel,
        emoji: "#️⃣",
      },
      status: "updated" as const,
    });
    expect(update).toHaveBeenCalledWith({
      channelId: "channel-ronda",
      tribeSlug: "matematica-pro",
      emoji: "#️⃣",
      name: "Ronda",
      sortOrder: 20,
    });
  });

  it("rejects a channel without name before calling the repository", async () => {
    const create = vi.fn();
    const execute = createTribeChannel({
      tribeChannelRepository: {
        create,
        delete: vi.fn(),
        listByTribeSlug: vi.fn(),
        update: vi.fn(),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "   ",
      })
    ).resolves.toEqual({ status: "invalid_name" as const });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a channel with text as emoji before calling the repository", async () => {
    const create = vi.fn();
    const execute = createTribeChannel({
      tribeChannelRepository: {
        create,
        delete: vi.fn(),
        listByTribeSlug: vi.fn(),
        update: vi.fn(),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        emoji: "fire",
        name: "Ronda",
      })
    ).resolves.toEqual({ status: "invalid_name" as const });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a channel with multiple emojis before calling the repository", async () => {
    const create = vi.fn();
    const execute = createTribeChannel({
      tribeChannelRepository: {
        create,
        delete: vi.fn(),
        listByTribeSlug: vi.fn(),
        update: vi.fn(),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        emoji: "🔥⭐",
        name: "Ronda",
      })
    ).resolves.toEqual({ status: "invalid_name" as const });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a channel creation when the name has more than 30 characters", async () => {
    const create = vi.fn();
    const execute = createTribeChannel({
      tribeChannelRepository: {
        create,
        delete: vi.fn(),
        listByTribeSlug: vi.fn(),
        update: vi.fn(),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Canal con nombre demasiado largo",
      })
    ).resolves.toEqual({ status: "invalid_name" as const });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a channel update with text as emoji before calling the repository", async () => {
    const update = vi.fn();
    const execute = updateTribeChannel({
      tribeChannelRepository: {
        create: vi.fn(),
        delete: vi.fn(),
        listByTribeSlug: vi.fn(),
        update,
      },
    });

    await expect(
      execute({
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        emoji: "fire",
        name: "Ronda",
        sortOrder: 20,
      })
    ).resolves.toEqual({ status: "invalid_name" as const });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a channel update when the name has more than 30 characters", async () => {
    const update = vi.fn();
    const execute = updateTribeChannel({
      tribeChannelRepository: {
        create: vi.fn(),
        delete: vi.fn(),
        listByTribeSlug: vi.fn(),
        update,
      },
    });

    await expect(
      execute({
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        emoji: "🔥",
        name: "Canal con nombre demasiado largo",
        sortOrder: 20,
      })
    ).resolves.toEqual({ status: "invalid_name" as const });
    expect(update).not.toHaveBeenCalled();
  });

  it("updates a channel with normalized text", async () => {
    const update = vi.fn(async () => ({
      channel,
      status: "updated" as const,
    }));
    const execute = updateTribeChannel({
      tribeChannelRepository: {
        create: vi.fn(),
        delete: vi.fn(),
        listByTribeSlug: vi.fn(),
        update,
      },
    });

    await expect(
      execute({
        channelId: " channel-ronda ",
        tribeSlug: " matematica-pro ",
        emoji: " 🔥 ",
        name: " Ronda ",
        sortOrder: 20,
      })
    ).resolves.toEqual({ channel, status: "updated" as const });
    expect(update).toHaveBeenCalledWith({
      channelId: "channel-ronda",
      tribeSlug: "matematica-pro",
      emoji: "🔥",
      name: "Ronda",
      sortOrder: 20,
    });
  });

  it("passes the target channel when deleting a channel with messages", async () => {
    const deleteChannel = vi.fn(async () => ({
      status: "moved_and_deleted" as const,
    }));
    const execute = deleteTribeChannel({
      tribeChannelRepository: {
        create: vi.fn(),
        delete: deleteChannel,
        listByTribeSlug: vi.fn(),
        update: vi.fn(),
      },
    });

    await expect(
      execute({
        channelId: " channel-questions ",
        tribeSlug: " matematica-pro ",
        targetChannelId: " channel-ronda ",
      })
    ).resolves.toEqual({ status: "moved_and_deleted" as const });
    expect(deleteChannel).toHaveBeenCalledWith({
      channelId: "channel-questions",
      tribeSlug: "matematica-pro",
      targetChannelId: "channel-ronda",
    });
  });

  it("omits targetChannelId when delete request sends an empty value", async () => {
    const deleteChannel = vi.fn(async () => ({
      status: "deleted" as const,
    }));
    const execute = deleteTribeChannel({
      tribeChannelRepository: {
        create: vi.fn(),
        delete: deleteChannel,
        listByTribeSlug: vi.fn(),
        update: vi.fn(),
      },
    });

    await expect(
      execute({
        channelId: " channel-questions ",
        tribeSlug: " matematica-pro ",
        targetChannelId: "   ",
      })
    ).resolves.toEqual({ status: "deleted" as const });
    expect(deleteChannel).toHaveBeenCalledWith({
      channelId: "channel-questions",
      tribeSlug: "matematica-pro",
      targetChannelId: undefined,
    });
  });
});
