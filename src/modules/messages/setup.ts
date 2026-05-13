import { createTribeMessage } from "@/src/modules/messages/application/use-cases/create-tribe-message-use-case";
import { createMessageReply } from "@/src/modules/messages/application/use-cases/create-message-reply-use-case";
import {
  listMessageReplies,
  listTribeRound,
} from "@/src/modules/messages/application/use-cases/list-tribe-round-use-case";
import {
  createTribeChannel,
  deleteTribeChannel,
  listTribeChannels,
  updateTribeChannel,
} from "@/src/modules/messages/application/use-cases/manage-tribe-channels-use-cases";
import { toggleMessageLike } from "@/src/modules/messages/application/use-cases/toggle-message-like-use-case";
import { toggleMessagePin } from "@/src/modules/messages/application/use-cases/toggle-message-pin-use-case";
import type {
  CreateTribeMessageCommand,
  CreateTribeChannelCommand,
  CreateMessageReplyCommand,
  DeleteTribeChannelCommand,
  ToggleMessageLikeCommand,
  ToggleMessagePinCommand,
  UpdateTribeChannelCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type {
  TribeRoundResult,
  TribeRoundRepliesResult,
  TribeRoundSharedDataResult,
} from "@/src/modules/messages/application/results/tribe-round-result";
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
  MessagePinToggleResult,
} from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessageReplyRepository } from "@/src/modules/messages/domain/repositories/message-reply-repository";
import type { TribeChannelRepository } from "@/src/modules/messages/domain/repositories/tribe-channel-repository";
import type { MessageCreationRepository } from "@/src/modules/messages/domain/repositories/message-creation-repository";
import type {
  ListMessageRepliesQuery,
  ListTribeRoundQuery,
  ListTribeRoundSharedDataQuery,
  MessageRoundReadRepository,
} from "@/src/modules/messages/domain/repositories/message-round-read-repository";
import type { MessageReactionRepository } from "@/src/modules/messages/domain/repositories/message-reaction-repository";
import type { MessagePinRepository } from "@/src/modules/messages/domain/repositories/message-pin-repository";

type MessagesModuleDependencies = {
  tribeChannelRepository: TribeChannelRepository;
  listCachedTribeRoundSharedData?: (
    query: ListTribeRoundSharedDataQuery
  ) => Promise<TribeRoundSharedDataResult>;
  messageReplyRepository: MessageReplyRepository;
  messageCreationRepository: MessageCreationRepository;
  messageRoundReadRepository: MessageRoundReadRepository;
  messageReactionRepository: MessageReactionRepository;
  messagePinRepository: MessagePinRepository;
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
    listMessageReplies: (
      query: ListMessageRepliesQuery
    ) => Promise<TribeRoundRepliesResult>;
    listTribeChannels: (
      query: ListTribeRoundQuery
    ) => Promise<TribeChannelListResult>;
    toggleMessageLike: (command: ToggleMessageLikeCommand) => Promise<MessageLikeToggleResult>;
    toggleMessagePin: (command: ToggleMessagePinCommand) => Promise<MessagePinToggleResult>;
    updateTribeChannel: (
      command: UpdateTribeChannelCommand
    ) => Promise<TribeChannelUpdateResult>;
  };
};

export function buildMessagesModule({
  tribeChannelRepository,
  listCachedTribeRoundSharedData,
  messageReplyRepository,
  messageCreationRepository,
  messageRoundReadRepository,
  messageReactionRepository,
  messagePinRepository,
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
      listTribeRound: listTribeRound({
        listCachedTribeRoundSharedData,
        messageRoundReadRepository,
      }),
      listMessageReplies: listMessageReplies({
        messageRoundReadRepository,
      }),
      listTribeChannels: listTribeChannels({
        tribeChannelRepository,
      }),
      toggleMessageLike: toggleMessageLike({ messageReactionRepository }),
      toggleMessagePin: toggleMessagePin({ messagePinRepository }),
      updateTribeChannel: updateTribeChannel({
        tribeChannelRepository,
      }),
    },
  };
}
