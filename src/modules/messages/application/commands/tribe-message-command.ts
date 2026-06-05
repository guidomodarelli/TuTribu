export type CreateTribeMessageCommand = {
  authorId: string;
  channelId: string;
  tribeSlug: string;
  content: string;
  images?: MessageImageDraftCommand[] | null;
  poll?: MessagePollDraftCommand | null;
  title: string;
  video?: MessageVideoDraftCommand | null;
};

export type MessageImageDraftCommand = {
  altText?: string | null;
  assetId: string;
};

export type MessageVideoDraftCommand = {
  url: string;
};

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
  images?: MessageImageDraftCommand[];
  messageId: string;
  poll?: MessagePollDraftCommand;
  title: string;
  tribeSlug: string;
  userId: string;
  video?: MessageVideoDraftCommand | null;
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
