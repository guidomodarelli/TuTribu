export type CreateCommunityPostCommand = {
  authorId: string;
  communitySlug: string;
  content: string;
};

export type CreatePostCommentCommand = CreateCommunityPostCommand & {
  postId: string;
};

export type TogglePostLikeCommand = {
  communitySlug: string;
  postId: string;
  userId: string;
};
