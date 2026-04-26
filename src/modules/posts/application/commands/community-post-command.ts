export type CreateCommunityPostCommand = {
  authorId: string;
  communitySlug: string;
  content: string;
  title: string;
};

export type CreatePostCommentCommand = {
  authorId: string;
  communitySlug: string;
  content: string;
  postId: string;
};

export type TogglePostLikeCommand = {
  communitySlug: string;
  postId: string;
  userId: string;
};
