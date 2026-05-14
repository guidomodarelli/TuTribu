import type {
  CreateTribeChannelCommand,
  DeleteTribeChannelCommand,
  UpdateTribeChannelCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type { TribeChannelListResult } from "@/src/modules/messages/application/results/tribe-channel-result";
import {
  TRIBE_CHANNEL_NAME,
  TRIBE_CHANNEL_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import { isSingleEmoji } from "@/src/modules/messages/domain/value-objects/channel-emoji";
import type {
  ListTribeChannelsQuery,
  TribeChannelRepository,
} from "@/src/modules/messages/domain/repositories/tribe-channel-repository";

type TribeChannelDependencies = {
  tribeChannelRepository: TribeChannelRepository;
};

function normalizeText(value: string): string {
  return value.trim();
}

function isInvalidText(value: string, limits: { maxLength: number; minLength: number }): boolean {
  return value.length < limits.minLength || value.length > limits.maxLength;
}

function isInvalidChannelInput(name: string, emoji: string): boolean {
  return isInvalidText(name, TRIBE_CHANNEL_NAME) || !isSingleEmoji(emoji);
}

export function listTribeChannels({
  tribeChannelRepository,
}: TribeChannelDependencies) {
  return async (
    query: ListTribeChannelsQuery
  ): Promise<TribeChannelListResult> => ({
    channels: await tribeChannelRepository.listByTribeSlug({
      tribeSlug: query.tribeSlug.trim(),
    }),
  });
}

export function createTribeChannel({
  tribeChannelRepository,
}: TribeChannelDependencies) {
  return async (command: CreateTribeChannelCommand) => {
    const name = normalizeText(command.name);
    const emoji = normalizeText(command.emoji);

    if (isInvalidChannelInput(name, emoji)) {
      return {
        status: TRIBE_CHANNEL_MUTATION_STATUS.invalidName,
      };
    }

    return tribeChannelRepository.create({
      tribeSlug: command.tribeSlug.trim(),
      emoji,
      name,
    });
  };
}

export function updateTribeChannel({
  tribeChannelRepository,
}: TribeChannelDependencies) {
  return async (command: UpdateTribeChannelCommand) => {
    const name = normalizeText(command.name);
    const emoji = normalizeText(command.emoji);

    if (isInvalidChannelInput(name, emoji)) {
      return {
        status: TRIBE_CHANNEL_MUTATION_STATUS.invalidName,
      };
    }

    return tribeChannelRepository.update({
      channelId: command.channelId.trim(),
      tribeSlug: command.tribeSlug.trim(),
      emoji,
      name,
      sortOrder: command.sortOrder,
    });
  };
}

export function deleteTribeChannel({
  tribeChannelRepository,
}: TribeChannelDependencies) {
  return async (command: DeleteTribeChannelCommand) => {
    const normalizedTargetChannelId = command.targetChannelId?.trim();

    return tribeChannelRepository.delete({
      channelId: command.channelId.trim(),
      tribeSlug: command.tribeSlug.trim(),
      targetChannelId: normalizedTargetChannelId || undefined,
    });
  };
}
