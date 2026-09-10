import { vi, describe, it, expect } from "vitest";
import {
  MESSAGE_FILE_PREPARATION_STATUS,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import { createTribeMessage } from "@/src/modules/messages/application/use-cases/create-tribe-message-use-case";

import type { MessageCreationResult } from "@/src/modules/messages/application/results/message-mutation-result";

const ASSET_ID = "a3bb189e-8bf9-4888-9912-ace4e6543002";

const BASE_COMMAND = {
  authorId: "user-1",
  channelId: "channel-1",
  content: "Hola tribu",
  title: "Bienvenida",
  tribeSlug: "mi-tribu",
};

function createCreationRepositoryDouble(result?: MessageCreationResult) {
  return {
    create: vi.fn<(...args: unknown[]) => Promise<MessageCreationResult>>(async () =>
      result ?? {
        message: { id: "message-1", title: "Bienvenida", content: "Hola tribu", createdAt: "2026-05-01T12:00:00.000Z", likeCount: 0, replyCount: 0, likedByViewer: false, replies: [], author: { id: "user-1", name: "Test member", image: null, role: "tribemate", avatarFallback: "TM" }, channel: { id: "channel-1", name: "Ronda", slug: "ronda", emoji: "", accessScope: "tribemates", sortOrder: 0 } },
        status: MESSAGE_MUTATION_STATUS.created,
      }
    ),
  };
}

describe("createTribeMessage with file attachments", () => {
  it("prepares the drafts and forwards them with index-based sortOrder", async () => {
    const messageCreationRepository = createCreationRepositoryDouble();
    const prepareForAttachment = vi.fn(async (command) => ({
      files: command.files,
      status: MESSAGE_FILE_PREPARATION_STATUS.ready,
    }));
    const execute = createTribeMessage({
      messageCreationRepository,
      messageFileRepository: { prepareForAttachment },
    });

    await execute({ ...BASE_COMMAND, files: [{ assetId: ASSET_ID }] });

    expect(prepareForAttachment).toHaveBeenCalledWith({
      files: [{ assetId: ASSET_ID, sortOrder: 0 }],
      tribeSlug: "mi-tribu",
      userId: "user-1",
    });
    expect(messageCreationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [{ assetId: ASSET_ID, sortOrder: 0 }],
      })
    );
  });

  it("returns invalid_file and reclaims drafts when preparation fails", async () => {
    const messageCreationRepository = createCreationRepositoryDouble();
    const deleteFile = vi.fn(async () => ({
      status: MESSAGE_MUTATION_STATUS.deleted,
    }));
    const execute = createTribeMessage({
      messageCreationRepository,
      messageFileRepository: {
        deleteFile,
        prepareForAttachment: vi.fn(async () => ({
          status: MESSAGE_MUTATION_STATUS.invalidFile,
        })),
      },
    });

    await expect(
      execute({ ...BASE_COMMAND, files: [{ assetId: ASSET_ID }] })
    ).resolves.toEqual({ status: MESSAGE_MUTATION_STATUS.invalidFile });

    expect(messageCreationRepository.create).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledWith({
      assetId: ASSET_ID,
      tribeSlug: "mi-tribu",
      userId: "user-1",
    });
  });

  it("reclaims prepared files when the repository rejects the message", async () => {
    const messageCreationRepository = createCreationRepositoryDouble({
      status: MESSAGE_MUTATION_STATUS.forbidden,
    });
    const deleteFile = vi.fn(async () => ({
      status: MESSAGE_MUTATION_STATUS.deleted,
    }));
    const execute = createTribeMessage({
      messageCreationRepository,
      messageFileRepository: {
        deleteFile,
        prepareForAttachment: vi.fn(async (command) => ({
          files: command.files,
          status: MESSAGE_FILE_PREPARATION_STATUS.ready,
        })),
      },
    });

    await expect(
      execute({ ...BASE_COMMAND, files: [{ assetId: ASSET_ID }] })
    ).resolves.toEqual({ status: MESSAGE_MUTATION_STATUS.forbidden });

    expect(deleteFile).toHaveBeenCalledWith({
      assetId: ASSET_ID,
      tribeSlug: "mi-tribu",
      userId: "user-1",
    });
  });

  it("rejects an over-limit file list before any preparation", async () => {
    const messageCreationRepository = createCreationRepositoryDouble();
    const prepareForAttachment = vi.fn();
    const execute = createTribeMessage({
      messageCreationRepository,
      messageFileRepository: { prepareForAttachment },
    });
    const files = Array.from({ length: 6 }, (unused, index) => ({
      assetId: `${index}3bb189e-8bf9-4888-9912-ace4e6543002`,
    }));

    await expect(execute({ ...BASE_COMMAND, files })).resolves.toEqual({
      status: MESSAGE_MUTATION_STATUS.invalidFile,
    });

    expect(prepareForAttachment).not.toHaveBeenCalled();
    expect(messageCreationRepository.create).not.toHaveBeenCalled();
  });
});
