export type CreateCommunityPostCommand = {
  authorId: string;
  categoryId: string;
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

export type CreateCommunityPostCategoryCommand = {
  communitySlug: string;
  emoji: string;
  name: string;
};

export type UpdateCommunityPostCategoryCommand = {
  categoryId: string;
  communitySlug: string;
  emoji: string;
  name: string;
  sortOrder: number;
};

export type DeleteCommunityPostCategoryCommand = {
  categoryId: string;
  communitySlug: string;
  targetCategoryId?: string;
};
