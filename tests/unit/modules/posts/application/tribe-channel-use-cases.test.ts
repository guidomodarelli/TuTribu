import {
  createTribeChannel,
  deleteTribeChannel,
  updateTribeChannel,
} from "@/src/modules/posts/application/use-cases/manage-tribe-channels-use-cases";

describe("channel use cases", () => {
  const channel = {
    accessScope: "tribemates" as const,
    emoji: "💬",
    id: "channel-general",
    name: "General",
    slug: "general",
    sortOrder: 20,
  };

  it("creates a channel when the name and emoji are valid", async () => {
    const create = jest.fn(async () => ({
      channel,
      status: "created" as const,
    }));
    const execute = createTribeChannel({
      tribeChannelRepository: {
        create,
        delete: jest.fn(),
        listByTribeSlug: jest.fn(),
        update: jest.fn(),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        emoji: " 💬 ",
        name: " General ",
      })
    ).resolves.toEqual({ channel, status: "created" });
    expect(create).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      emoji: "💬",
      name: "General",
    });
  });

  it("rejects a channel without name before calling the repository", async () => {
    const create = jest.fn();
    const execute = createTribeChannel({
      tribeChannelRepository: {
        create,
        delete: jest.fn(),
        listByTribeSlug: jest.fn(),
        update: jest.fn(),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        emoji: "💬",
        name: "   ",
      })
    ).resolves.toEqual({ status: "invalid_name" });
    expect(create).not.toHaveBeenCalled();
  });

  it("updates a channel with normalized text", async () => {
    const update = jest.fn(async () => ({
      channel,
      status: "updated" as const,
    }));
    const execute = updateTribeChannel({
      tribeChannelRepository: {
        create: jest.fn(),
        delete: jest.fn(),
        listByTribeSlug: jest.fn(),
        update,
      },
    });

    await expect(
      execute({
        channelId: " channel-general ",
        tribeSlug: " matematica-pro ",
        emoji: " 💬 ",
        name: " General ",
        sortOrder: 20,
      })
    ).resolves.toEqual({ channel, status: "updated" });
    expect(update).toHaveBeenCalledWith({
      channelId: "channel-general",
      tribeSlug: "matematica-pro",
      emoji: "💬",
      name: "General",
      sortOrder: 20,
    });
  });

  it("passes the target channel when deleting a channel with posts", async () => {
    const deleteChannel = jest.fn(async () => ({
      status: "moved_and_deleted" as const,
    }));
    const execute = deleteTribeChannel({
      tribeChannelRepository: {
        create: jest.fn(),
        delete: deleteChannel,
        listByTribeSlug: jest.fn(),
        update: jest.fn(),
      },
    });

    await expect(
      execute({
        channelId: " channel-questions ",
        tribeSlug: " matematica-pro ",
        targetChannelId: " channel-general ",
      })
    ).resolves.toEqual({ status: "moved_and_deleted" });
    expect(deleteChannel).toHaveBeenCalledWith({
      channelId: "channel-questions",
      tribeSlug: "matematica-pro",
      targetChannelId: "channel-general",
    });
  });

  it("omits targetChannelId when delete request sends an empty value", async () => {
    const deleteChannel = jest.fn(async () => ({
      status: "deleted" as const,
    }));
    const execute = deleteTribeChannel({
      tribeChannelRepository: {
        create: jest.fn(),
        delete: deleteChannel,
        listByTribeSlug: jest.fn(),
        update: jest.fn(),
      },
    });

    await expect(
      execute({
        channelId: " channel-questions ",
        tribeSlug: " matematica-pro ",
        targetChannelId: "   ",
      })
    ).resolves.toEqual({ status: "deleted" });
    expect(deleteChannel).toHaveBeenCalledWith({
      channelId: "channel-questions",
      tribeSlug: "matematica-pro",
      targetChannelId: undefined,
    });
  });
});
