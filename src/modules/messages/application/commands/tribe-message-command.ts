import type { MESSAGE_MEDIA_KIND } from "@/src/modules/messages/constants/message-round";

export type CreateTribeMessageCommand = {
  authorId: string;
  channelId: string;
  tribeSlug: string;
  content: string;
  files?: MessageFileDraftCommand[] | null;
  media?: MessageMediaDraftCommand[] | null;
  poll?: MessagePollDraftCommand | null;
  title: string;
};

/**
 * A single file attachment draft submitted by the composer. The array index
 * expresses the author-chosen slot (`sortOrder`) within the downloads list.
 */
export type MessageFileDraftCommand = {
  assetId: string;
};

export type MessageImageDraftCommand = {
  altText?: string | null;
  assetId: string;
};

export type MessageVideoDraftCommand = {
  url: string;
};

/**
 * A single media attachment draft submitted by the composer. Images and
 * external videos share one ordered list so the array index expresses the
 * author-chosen global slot (`sortOrder`).
 */
export type MessageMediaDraftCommand =
  | ({ kind: typeof MESSAGE_MEDIA_KIND.image } & MessageImageDraftCommand)
  | ({ kind: typeof MESSAGE_MEDIA_KIND.video } & MessageVideoDraftCommand);

export type CreateMessageReplyCommand = {
  authorId: string;
  tribeSlug: string;
  content: string;
  messageId: string;
};

export type ToggleMessageLikeCommand = {
  tribeSlug: string;
  messageId: string;
  userId: string;
};

export type ToggleMessagePinCommand = {
  tribeSlug: string;
  messageId: string;
  userId: string;
};

export type DeleteTribeMessageCommand = {
  tribeSlug: string;
  messageId: string;
  userId: string;
};

export type UpdateTribeMessageCreatedAtCommand = {
  createdAt: string;
  messageId: string;
  tribeSlug: string;
  userId: string;
};

export type UpdateTribeMessageContentCommand = {
  content: string;
  files?: MessageFileDraftCommand[];
  media?: MessageMediaDraftCommand[];
  messageId: string;
  poll?: MessagePollDraftCommand;
  title: string;
  tribeSlug: string;
  userId: string;
};

export type MessagePollDraftCommand = {
  allowMultipleVotes: boolean;
  options: string[];
};

export type SubmitMessagePollVoteCommand = {
  messageId: string;
  optionIds: string[];
  tribeSlug: string;
  userId: string;
};

export type CreateTribeChannelCommand = {
  tribeSlug: string;
  emoji: string;
  name: string;
};

export type UpdateTribeChannelCommand = {
  channelId: string;
  tribeSlug: string;
  emoji: string;
  name: string;
  sortOrder: number;
};

export type DeleteTribeChannelCommand = {
  channelId: string;
  tribeSlug: string;
  targetChannelId?: string;
};
