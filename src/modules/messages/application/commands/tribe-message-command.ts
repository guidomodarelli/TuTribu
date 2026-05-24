export type CreateTribeMessageCommand = {
  authorId: string;
  channelId: string;
  tribeSlug: string;
  content: string;
  poll?: MessagePollDraftCommand | null;
  title: string;
  video?: MessageVideoDraftCommand | null;
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

export type MessagePollDraftCommand = {
  allowMultipleVotes: boolean;
  options: string[];
  question: string;
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
