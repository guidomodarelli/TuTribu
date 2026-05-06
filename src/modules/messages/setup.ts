import { createTribeMessage } from "@/src/modules/messages/application/use-cases/create-tribe-message-use-case";
import { createMessageReply } from "@/src/modules/messages/application/use-cases/create-message-reply-use-case";
import { listTribeRound } from "@/src/modules/messages/application/use-cases/list-tribe-round-use-case";
import {
  createTribeChannel,
  deleteTribeChannel,
  listTribeChannels,
  updateTribeChannel,
} from "@/src/modules/messages/application/use-cases/manage-tribe-channels-use-cases";
import { toggleMessageLike } from "@/src/modules/messages/application/use-cases/toggle-message-like-use-case";
import type {
  CreateTribeMessageCommand,
  CreateTribeChannelCommand,
  CreateMessageReplyCommand,
  DeleteTribeChannelCommand,
  ToggleMessageLikeCommand,
  UpdateTribeChannelCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type { TribeRoundResult } from "@/src/modules/messages/application/results/tribe-round-result";
import type {
  TribeChannelCreationResult,
  TribeChannelDeletionResult,
  TribeChannelListResult,
  TribeChannelUpdateResult,
} from "@/src/modules/messages/application/results/tribe-channel-result";
import type {
  MessageReplyCreationResult,
  MessageCreationResult,
  MessageLikeToggleResult,
} from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessageReplyRepository } from "@/src/modules/messages/domain/repositories/message-reply-repository";
import type { TribeChannelRepository } from "@/src/modules/messages/domain/repositories/tribe-channel-repository";
import type { MessageCreationRepository } from "@/src/modules/messages/domain/repositories/message-creation-repository";
import type {
  ListTribeRoundQuery,
  MessageRoundReadRepository,
} from "@/src/modules/messages/domain/repositories/message-round-read-repository";
import type { MessageReactionRepository } from "@/src/modules/messages/domain/repositories/message-reaction-repository";

type MessagesModuleDependencies = {
  tribeChannelRepository: TribeChannelRepository;
  messageReplyRepository: MessageReplyRepository;
  messageCreationRepository: MessageCreationRepository;
  messageRoundReadRepository: MessageRoundReadRepository;
  messageReactionRepository: MessageReactionRepository;
};

type MessagesModule = {
  useCases: {
    createTribeMessage: (
      command: CreateTribeMessageCommand
    ) => Promise<MessageCreationResult>;
    createTribeChannel: (
      command: CreateTribeChannelCommand
    ) => Promise<TribeChannelCreationResult>;
    deleteTribeChannel: (
      command: DeleteTribeChannelCommand
    ) => Promise<TribeChannelDeletionResult>;
    createMessageReply: (
      command: CreateMessageReplyCommand
    ) => Promise<MessageReplyCreationResult>;
    listTribeRound: (query: ListTribeRoundQuery) => Promise<TribeRoundResult>;
    listTribeChannels: (
      query: ListTribeRoundQuery
    ) => Promise<TribeChannelListResult>;
    toggleMessageLike: (command: ToggleMessageLikeCommand) => Promise<MessageLikeToggleResult>;
    updateTribeChannel: (
      command: UpdateTribeChannelCommand
    ) => Promise<TribeChannelUpdateResult>;
  };
};

export function buildMessagesModule({
  tribeChannelRepository,
  messageReplyRepository,
  messageCreationRepository,
  messageRoundReadRepository,
  messageReactionRepository,
}: MessagesModuleDependencies): MessagesModule {
  return {
    useCases: {
      createTribeMessage: createTribeMessage({ messageCreationRepository }),
      createTribeChannel: createTribeChannel({
        tribeChannelRepository,
      }),
      deleteTribeChannel: deleteTribeChannel({
        tribeChannelRepository,
      }),
      createMessageReply: createMessageReply({ messageReplyRepository }),
      listTribeRound: listTribeRound({ messageRoundReadRepository }),
      listTribeChannels: listTribeChannels({
        tribeChannelRepository,
      }),
      toggleMessageLike: toggleMessageLike({ messageReactionRepository }),
      updateTribeChannel: updateTribeChannel({
        tribeChannelRepository,
      }),
    },
  };
}
