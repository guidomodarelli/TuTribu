export type CreateTribePostCommand = {
  authorId: string;
  categoryId: string;
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

export type CreateTribePostCategoryCommand = {
  tribeSlug: string;
  emoji: string;
  name: string;
};

export type UpdateTribePostCategoryCommand = {
  categoryId: string;
  tribeSlug: string;
  emoji: string;
  name: string;
  sortOrder: number;
};

export type DeleteTribePostCategoryCommand = {
  categoryId: string;
  tribeSlug: string;
  targetCategoryId?: string;
};
