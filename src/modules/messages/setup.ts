import { cleanupOrphanMessageImages } from "@/src/modules/messages/application/use-cases/cleanup-orphan-message-images-use-case";
import { createTribeMessage } from "@/src/modules/messages/application/use-cases/create-tribe-message-use-case";
import { createMessageReply } from "@/src/modules/messages/application/use-cases/create-message-reply-use-case";
import { deleteTribeMessage } from "@/src/modules/messages/application/use-cases/delete-tribe-message-use-case";
import { updateTribeMessageContent } from "@/src/modules/messages/application/use-cases/update-tribe-message-content-use-case";
import { updateTribeMessageCreatedAt } from "@/src/modules/messages/application/use-cases/update-tribe-message-created-at-use-case";
import {
  listMessageLikers,
  listMessageReplies,
  listTribeRound,
} from "@/src/modules/messages/application/use-cases/list-tribe-round-use-case";
import { submitMessagePollVote } from "@/src/modules/messages/application/use-cases/manage-message-polls-use-cases";
import {
  createMessageImageUpload,
  deleteMessageImage,
} from "@/src/modules/messages/application/use-cases/message-images-use-cases";
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
  DeleteTribeMessageCommand,
  SubmitMessagePollVoteCommand,
  ToggleMessageLikeCommand,
  ToggleMessagePinCommand,
  UpdateTribeChannelCommand,
  UpdateTribeMessageContentCommand,
  UpdateTribeMessageCreatedAtCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type {
  TribeRoundResult,
  TribeRoundLikersResult,
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
  MessageContentUpdateResult,
  MessageCreatedAtUpdateResult,
  MessageReplyCreationResult,
  MessageCreationResult,
  MessageDeletionResult,
  MessageLikeToggleResult,
  MessagePollMutationResult,
  MessagePinToggleResult,
} from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessageContentUpdateRepository } from "@/src/modules/messages/domain/repositories/message-content-update-repository";
import type { MessageCreatedAtUpdateRepository } from "@/src/modules/messages/domain/repositories/message-created-at-update-repository";
import type { MessageReplyRepository } from "@/src/modules/messages/domain/repositories/message-reply-repository";
import type { TribeChannelRepository } from "@/src/modules/messages/domain/repositories/tribe-channel-repository";
import type { MessageCreationRepository } from "@/src/modules/messages/domain/repositories/message-creation-repository";
import type {
  ListMessageLikersQuery,
  ListMessageRepliesQuery,
  ListTribeRoundQuery,
  ListTribeRoundSharedDataQuery,
  MessageRoundReadRepository,
} from "@/src/modules/messages/domain/repositories/message-round-read-repository";
import type { MessageReactionRepository } from "@/src/modules/messages/domain/repositories/message-reaction-repository";
import type { MessagePinRepository } from "@/src/modules/messages/domain/repositories/message-pin-repository";
import type { MessagePollRepository } from "@/src/modules/messages/domain/repositories/message-poll-repository";
import type { MessageDeletionRepository } from "@/src/modules/messages/domain/repositories/message-deletion-repository";
import type {
  CleanupOrphanMessageImagesResult,
  CreateMessageImageUploadCommand,
  DeleteMessageImageCommand,
  MessageImageDeletionResult,
  MessageImageRepository,
  MessageImageUploadCreationResult,
} from "@/src/modules/messages/domain/repositories/message-image-repository";

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
  messagePollRepository: MessagePollRepository;
  messageDeletionRepository: MessageDeletionRepository;
  messageCreatedAtUpdateRepository: MessageCreatedAtUpdateRepository;
  messageContentUpdateRepository: MessageContentUpdateRepository;
  messageImageRepository: MessageImageRepository;
};

type MessagesModule = {
  useCases: {
    cleanupOrphanMessageImages: () => Promise<CleanupOrphanMessageImagesResult>;
    createTribeMessage: (
      command: CreateTribeMessageCommand
    ) => Promise<MessageCreationResult>;
    createTribeChannel: (
      command: CreateTribeChannelCommand
    ) => Promise<TribeChannelCreationResult>;
    deleteTribeChannel: (
      command: DeleteTribeChannelCommand
    ) => Promise<TribeChannelDeletionResult>;
    deleteTribeMessage: (
      command: DeleteTribeMessageCommand
    ) => Promise<MessageDeletionResult>;
    createMessageReply: (
      command: CreateMessageReplyCommand
    ) => Promise<MessageReplyCreationResult>;
    createMessageImageUpload: (
      command: CreateMessageImageUploadCommand
    ) => Promise<MessageImageUploadCreationResult>;
    deleteMessageImage: (
      command: DeleteMessageImageCommand
    ) => Promise<MessageImageDeletionResult>;
    listTribeRound: (query: ListTribeRoundQuery) => Promise<TribeRoundResult>;
    listMessageReplies: (
      query: ListMessageRepliesQuery
    ) => Promise<TribeRoundRepliesResult>;
    listMessageLikers: (
      query: ListMessageLikersQuery
    ) => Promise<TribeRoundLikersResult>;
    listTribeChannels: (
      query: ListTribeRoundQuery
    ) => Promise<TribeChannelListResult>;
    toggleMessageLike: (command: ToggleMessageLikeCommand) => Promise<MessageLikeToggleResult>;
    toggleMessagePin: (command: ToggleMessagePinCommand) => Promise<MessagePinToggleResult>;
    submitMessagePollVote: (
      command: SubmitMessagePollVoteCommand
    ) => Promise<MessagePollMutationResult>;
    updateTribeChannel: (
      command: UpdateTribeChannelCommand
    ) => Promise<TribeChannelUpdateResult>;
    updateTribeMessageContent: (
      command: UpdateTribeMessageContentCommand
    ) => Promise<MessageContentUpdateResult>;
    updateTribeMessageCreatedAt: (
      command: UpdateTribeMessageCreatedAtCommand
    ) => Promise<MessageCreatedAtUpdateResult>;
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
  messagePollRepository,
  messageDeletionRepository,
  messageCreatedAtUpdateRepository,
  messageContentUpdateRepository,
  messageImageRepository,
}: MessagesModuleDependencies): MessagesModule {
  return {
    useCases: {
      cleanupOrphanMessageImages: cleanupOrphanMessageImages({
        messageImageRepository,
      }),
      createTribeMessage: createTribeMessage({
        messageCreationRepository,
        messageImageRepository,
      }),
      createTribeChannel: createTribeChannel({
        tribeChannelRepository,
      }),
      deleteTribeChannel: deleteTribeChannel({
        tribeChannelRepository,
      }),
      deleteTribeMessage: deleteTribeMessage({
        messageDeletionRepository,
        messageImageRepository,
      }),
      createMessageReply: createMessageReply({ messageReplyRepository }),
      createMessageImageUpload: createMessageImageUpload({
        messageImageRepository,
      }),
      deleteMessageImage: deleteMessageImage({ messageImageRepository }),
      listTribeRound: listTribeRound({
        listCachedTribeRoundSharedData,
        messageRoundReadRepository,
      }),
      listMessageReplies: listMessageReplies({
        messageRoundReadRepository,
      }),
      listMessageLikers: listMessageLikers({
        messageRoundReadRepository,
      }),
      listTribeChannels: listTribeChannels({
        tribeChannelRepository,
      }),
      toggleMessageLike: toggleMessageLike({ messageReactionRepository }),
      toggleMessagePin: toggleMessagePin({ messagePinRepository }),
      submitMessagePollVote: submitMessagePollVote({ messagePollRepository }),
      updateTribeChannel: updateTribeChannel({
        tribeChannelRepository,
      }),
      updateTribeMessageContent: updateTribeMessageContent({
        messageContentUpdateRepository,
        messageImageRepository,
      }),
      updateTribeMessageCreatedAt: updateTribeMessageCreatedAt({
        messageCreatedAtUpdateRepository,
      }),
    },
  };
}
