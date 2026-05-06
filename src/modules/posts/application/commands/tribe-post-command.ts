export type CreateTribePostCommand = {
  authorId: string;
  channelId: string;
  tribeSlug: string;
  content: string;
  title: string;
};

export type CreatePostCommentCommand = {
  authorId: string;
  tribeSlug: string;
  content: string;
  postId: string;
};

export type TogglePostLikeCommand = {
  tribeSlug: string;
  postId: string;
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
