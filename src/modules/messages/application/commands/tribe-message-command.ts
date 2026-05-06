export type CreateTribeMessageCommand = {
  authorId: string;
  channelId: string;
  tribeSlug: string;
  content: string;
  title: string;
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
